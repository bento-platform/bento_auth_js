import { createAction, createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { JWTPayload, decodeJwt } from "jose";

import { buildUrlEncodedData, makeAuthorizationHeader } from "../utils";
import { LS_BENTO_WAS_SIGNED_IN, setLSNotSignedIn } from "../performAuth";
import { Resource, makeResourceKey } from "../resources";
import { RootState } from "./store";

type BaseError = {
    error: string;
    error_description?: string;
};

type TokenHandoffParams = {
    code: string;
    clientId: string;
    authCallbackUrl: string;
    verifier: string;
};

type TokenHandoffPayload = {
    access_token: string,
    expires_in: number,
    id_token: string,
    refresh_token: string,
    error?: {
        error?: string;
        error_description?: string;
    };
};

type TokenHandoffError = BaseError;

const missingOpenIdConfig: TokenHandoffError = {
    error: "Error while attempting to perform the token handoff",
    error_description: "No token endpoint available/No openIdConfiguration data",
};

export const tokenHandoff = createAsyncThunk< TokenHandoffPayload, TokenHandoffParams >("auth/TOKEN_HANDOFF",
    async (handoffParams, { getState, rejectWithValue }) => {
        const state = getState() as RootState;
        const url = state.openIdConfiguration.data?.token_endpoint;

        if (!url) return rejectWithValue(missingOpenIdConfig);

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: buildUrlEncodedData({
                grant_type: "authorization_code",
                code: handoffParams.code,
                client_id: handoffParams.clientId,
                redirect_uri: handoffParams.authCallbackUrl,
                code_verifier: handoffParams.verifier,
            }),
        });

        return (await response.json()) as TokenHandoffPayload;
    }
);

type RefreshTokenPayload = {
    access_token: string,
    expires_in: number,
    id_token: string,
    refresh_token: string,
};
export const refreshTokens = createAsyncThunk<RefreshTokenPayload, string>(
    "auth/REFRESH_TOKENS",
    async (clientId: string , { getState }) => {
        const state = getState() as RootState;
        const url = state.openIdConfiguration.data?.token_endpoint;

        if (!url) return;

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: buildUrlEncodedData({
                grant_type: "refresh_token",
                client_id: clientId,
                refresh_token: state.auth.refreshToken,
            }),
        });

        const body = await response.json();

        if (!response.ok) {
            const errorDetail = (body && (body.error || body.error_description))
                ? `: ${body?.error} – ${body?.error_description}`
                : "";
            throw new Error(`Error encountered while refreshing token${errorDetail}`);
        }

        return await body;
    },
    {
        condition: (_: string, { getState }): boolean => {
            const { auth, openIdConfiguration } = getState() as RootState;
            if (!openIdConfiguration.data?.["token_endpoint"]) {
                console.error("No token endpoint available/No openIdConfiguration data");
                return false;
            }
            const { isRefreshingTokens, refreshToken } = auth;
            return !isRefreshingTokens && refreshToken !== null;
        },
    }
);

export const setIsAutoAuthenticating = createAction<boolean>("auth/SET_IS_AUTO_AUTHENTICATING");

type FetchPermissionsPayload = {
    result: string[][];
};
type FetchPermissionsParams = {
    resources: Resource[];
    authzUrl: string;
}
export const fetchResourcesPermissions = createAsyncThunk<FetchPermissionsPayload, FetchPermissionsParams>(
    "auth/FETCH_RESOURCES_PERMISSIONS",
    async ({ resources, authzUrl }: FetchPermissionsParams, { getState }) => {
        const url = `${authzUrl}/policy/permissions`;
        const { auth } = getState() as RootState;
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...makeAuthorizationHeader(auth.accessToken) },
            body: JSON.stringify({ resources }),
        });
        return await response.json();
    },
    {
        condition: ({ resources }, { getState }) => {
            // allow action to fire if all requested resource permission-sets are not being fetched right now:

            const { auth } = getState() as RootState;

            return resources.every((resource) => {
                const key = makeResourceKey(resource);
                const rp = auth.resourcePermissions?.[key];
                return !rp?.isFetching;
            });
        },
    }
);

const nullSession = {
    sessionExpiry: undefined,
    idToken: undefined,
    idTokenContents: undefined,
    accessToken: undefined,
    refreshToken: undefined,
};

export type AuthSliceState = {
    loading: boolean;
    hasAttempted: boolean;

    isHandingOffCodeForToken: boolean;
    handoffError: string;

    isRefreshingTokens: boolean;
    tokensRefreshError: string;

    isAutoAuthenticating: boolean;

    resourcePermissions: {
        [name: string]: {
            isFetching: boolean;
            hasAttempted: boolean;
            error: string;
            permissions: string[];
        };
    };

    sessionExpiry?: number;
    idToken?: string;
    idTokenContents?: JWTPayload;

    accessToken?: string;
    refreshToken?: string;
};
const initialState: AuthSliceState = {
    loading: false,
    hasAttempted: false,

    isHandingOffCodeForToken: false,
    handoffError: "",

    isRefreshingTokens: false,
    tokensRefreshError: "",

    isAutoAuthenticating: false,

    resourcePermissions: {},
};

const setTokenStateFromPayload = (state: AuthSliceState, payload: TokenHandoffPayload | RefreshTokenPayload) => {
    const {
        access_token: accessToken,
        expires_in: exp,
        id_token: idToken,
        refresh_token: refreshToken,
    } = payload;

    state.sessionExpiry = new Date().getTime() / 1000 + exp;
    state.idToken = idToken;
    state.idTokenContents = decodeJwt(idToken);
    state.accessToken = accessToken;
    state.refreshToken = refreshToken ?? state.refreshToken;
};

export const authSlice = createSlice({
    name: "auth",
    initialState,
    reducers: {
        signOut: (state) => {
            setLSNotSignedIn();
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            Object.assign(state, {
                ...state,
                ...nullSession,
                tokensRefreshError: "",
                resourcePermissions: {},
            });
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(tokenHandoff.pending, (state) => {
                state.isHandingOffCodeForToken = true;
            })
            .addCase(tokenHandoff.fulfilled, (state, { payload }) => {
                state.loading = false;
                // Reset hasAttempted for user-dependent data if we just signed in
                state.hasAttempted = (!state.idTokenContents && payload.id_token) ? false : state.hasAttempted;
                setTokenStateFromPayload(state, payload);
                state.isHandingOffCodeForToken = false;
                localStorage.setItem(LS_BENTO_WAS_SIGNED_IN, "true");
            })
            .addCase(tokenHandoff.rejected, (state, { error }) => {
                const handoffError = error.message ?? "Error handing off authorization code for token";
                console.error(handoffError);
                Object.assign(state, {
                    ...state,
                    ...nullSession,
                    loading: false,
                    isHandingOffCodeForToken: false,
                    handoffError: handoffError,
                    resourcePermissions: {},
                });
                setLSNotSignedIn();
            })
            .addCase(refreshTokens.pending, (state) => {
                state.isRefreshingTokens = true;
            })
            .addCase(refreshTokens.fulfilled, (state, { payload }) => {
                if (payload) {
                    setTokenStateFromPayload(state, payload);
                    state.isRefreshingTokens = false;
                    localStorage.setItem(LS_BENTO_WAS_SIGNED_IN, "true");
                }
            })
            .addCase(refreshTokens.rejected, (state, { error }) => {
                console.error(error);
                const refreshError = error.message ?? "Error refreshing tokens";

                Object.assign(state, {
                    ...state,
                    ...nullSession,
                    tokensRefreshError: refreshError,
                    resourcePermissions: {},
                    isRefreshingTokens: false
                });

                setLSNotSignedIn();
            })
            .addCase(setIsAutoAuthenticating, (state, { payload }) => {
                state.isAutoAuthenticating = payload;
            })
            .addCase(fetchResourcesPermissions.pending, (state, { meta }) => {
                for (const resource of meta.arg.resources) {
                    const key = makeResourceKey(resource);
                    state.resourcePermissions[key] = {
                        ...state.resourcePermissions[key],
                        isFetching: true,
                        hasAttempted: false,
                        permissions: [],
                        error: "",
                    };
                }
            })
            .addCase(fetchResourcesPermissions.fulfilled, (state, { meta, payload }) => {
                const resources = meta.arg.resources;
                for (const r in resources) {
                    const key = makeResourceKey(resources[r]);
                    state.resourcePermissions[key] = {
                        ...state.resourcePermissions[key],
                        isFetching: false,
                        hasAttempted: true,
                        permissions: payload?.result?.[r] ?? [],
                    };
                }
            })
            .addCase(fetchResourcesPermissions.rejected, (state, { meta, error }) => {
                if (error) console.error(error);

                for (const resource of meta.arg.resources) {
                    const key = makeResourceKey(resource);

                    const permissionsError = error.message ??
                        "An error occurred while fetching permissions for a resource";
                    state.resourcePermissions[key] = {
                        ...state.resourcePermissions[key],
                        isFetching: false,
                        hasAttempted: true,
                        error: permissionsError,
                    };
                }
            });
    },
});

export const { signOut } = authSlice.actions;
export default authSlice.reducer;
