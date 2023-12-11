import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { JWTPayload, decodeJwt } from "jose";

import { buildUrlEncodedData } from "../utils";
import { LS_BENTO_WAS_SIGNED_IN, setLSNotSignedIn } from "../performAuth";
import { makeResourceKey } from "../resources";
import { RootState } from "./store";

type TokenHandoffParams = {
    code: string;
    clientId: string;
    authCallbackUrl: string;
    verifier: string;
};
type TokenHandoffPayload = {
    data: {
        access_token: string,
        expires_in: number,
        id_token: string,
        refresh_token: string,
    },
    error?: {
        error?: any;
        error_description?: string;
    };
};
type TokenHandoffError = TokenHandoffPayload;
export const tokenHandoff = createAsyncThunk<
    TokenHandoffPayload, 
    TokenHandoffParams,
    {
        rejectValue: TokenHandoffError,
    }>("auth/TOKEN_HANDOFF",
    async (handoffParams, { getState, rejectWithValue }) => {
        const state = getState() as RootState;
        const url = state.openIdConfiguration.data?.["token_endpoint"];

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

        const body = await response.json();
        if (response.status !== 200) {
            return rejectWithValue(body as TokenHandoffError);
        }
        return body as TokenHandoffPayload;
    }
);

export const refreshTokens = createAsyncThunk<any, string, {rejectValue: any}>(
    "auth/REFRESH_TOKENS",
    async (clientId: string , { getState }) => {
        const state = getState() as RootState;
        const url = state.openIdConfiguration.data["token_endpoint"];

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Authorization: `Bearer ${state.auth.accessToken}`,
            },
            body: buildUrlEncodedData({
                grant_type: "refresh_token",
                client_id: clientId,
                refresh_token: state.auth.refreshToken,
            }),
        });

        // Assuming the server responds with JSON
        return await response.json();
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

type PermissionParams = {
    resource: string;
    authzUrl: string;
}
export const fetchResourcePermissions = createAsyncThunk<any, PermissionParams, { rejectValue: any }>(
    "auth/FETCH_RESOURCE_PERMISSIONS",
    async ({ resource, authzUrl: authUrl }: PermissionParams, { getState }) => {
        const url = `${authUrl}/policy/permissions`;
        const { auth } = getState() as RootState;
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.accessToken}` },
            body: JSON.stringify({ resources: resource }),
        });
        return await response.json();
    },
    {
        condition: ({ resource }, { getState }) => {
            const { auth } = getState() as RootState;
            const key = makeResourceKey(resource);
            const rp = auth.resourcePermissions?.[key];
            return !rp?.isFetching;
        },
    }
);

const nullSession = {
    sessionExpiry: null,
    idToken: null,
    idTokenContents: null,
    accessToken: null,
    refreshToken: null,
};

type AuthSliceState = {
    loading: boolean;
    hasAttempted: boolean;

    isHandingOffCodeForToken: boolean;
    handoffError: string;

    isRefreshingTokens: boolean;
    tokensRefreshError: string;

    resourcePermissions: {
        [name: string]: {
            isFetching: boolean;
            hasAttempted: boolean;
            error: string;
            permissions: string[];
        };
    };

    sessionExpiry?: number | null;
    idToken?: string | null;
    idTokenContents?: JWTPayload | null;

    accessToken?: string | null;
    refreshToken?: string | null;
};
const initialState: AuthSliceState = {
    loading: false,
    hasAttempted: false,

    isHandingOffCodeForToken: false,
    handoffError: "",

    isRefreshingTokens: false,
    tokensRefreshError: "",

    // Below is token/token-derived data

    // sessionExpiry: null,
    // idToken: null,
    // idTokenContents: null,

    //  - NEVER dehydrate the below items to localStorage; it is a security risk!
    // accessToken: null,
    // refreshToken: null,

    // Below is permissions caching for controlling how the UI appears for different resources
    //  - It's in this reducer since signing out / losing a token will clear permissions caches.
    resourcePermissions: {},
};

export const authSlice = createSlice({
    name: "auth",
    initialState,
    reducers: {
        signOut: (state) => {
            setLSNotSignedIn();
            state = {
                ...state,
                ...nullSession,
                tokensRefreshError: "",
                resourcePermissions: {},
            };
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(tokenHandoff.pending, (state) => {
                state.isHandingOffCodeForToken = true;
            })
            .addCase(tokenHandoff.fulfilled, (state, { payload }) => {
                state.loading = false;
                const {
                    access_token: accessToken,
                    expires_in: exp,
                    id_token: idToken,
                    refresh_token: refreshToken,
                } = payload.data;

                // Reset hasAttempted for user-dependent data if we just signed in
                state.hasAttempted = !state.idTokenContents && idToken ? false : state.hasAttempted;
                state.sessionExpiry = new Date().getTime() / 1000 + exp;
                state.idToken = idToken;
                state.idTokenContents = decodeJwt(idToken);
                state.accessToken = accessToken;
                state.refreshToken = refreshToken ?? state.refreshToken;
                state.isHandingOffCodeForToken = false;
                localStorage.setItem(LS_BENTO_WAS_SIGNED_IN, "true");
            })
            .addCase(tokenHandoff.rejected, (state, action) => {
                let handoffError = "";
                if (action.payload) {
                    const { error, error_description: errorDesc } = action.payload.error ?? {};
                    if (error) {
                        handoffError = `${error}: ${errorDesc}`
                    }
                } else {
                    handoffError = action.error.message ?? "Error handing off authorization code for token";
                }

                console.error(handoffError);
                state.handoffError = handoffError;
                state.resourcePermissions = {};

                // Set null session
                state.sessionExpiry = null,
                state.idToken = null,
                state.idTokenContents = null,
                state.accessToken = null,
                state.refreshToken = null,

                state.loading = false;
                state.isHandingOffCodeForToken = false;
                setLSNotSignedIn();
            })
            .addCase(refreshTokens.pending, (state) => {
                state.isRefreshingTokens = true;
            })
            .addCase(refreshTokens.fulfilled, (state, { payload }) => {
                if (payload) {
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
                    state.isRefreshingTokens = false;
                    localStorage.setItem(LS_BENTO_WAS_SIGNED_IN, "true");
                }
            })
            .addCase(refreshTokens.rejected, (state, { payload, error: errorProp }) => {
                if (errorProp) console.error(errorProp);
                const { error, error_description: errorDesc } = payload.data ?? {};
                const tokensRefreshError = error
                    ? `${error}: ${errorDesc}`
                    : errorProp.message ?? "Error refreshing tokens";
                console.error(tokensRefreshError);
                state.tokensRefreshError = tokensRefreshError;
                state.resourcePermissions = {};

                // Set null session
                state.sessionExpiry = null,
                state.idToken = null,
                state.idTokenContents = null,
                state.accessToken = null,
                state.refreshToken = null,

                state.isRefreshingTokens = false;
                setLSNotSignedIn();
            })
            .addCase(fetchResourcePermissions.pending, (state, { meta }) => {
                const key = makeResourceKey(meta.arg.resource);
                state.resourcePermissions[key] = {
                    ...state.resourcePermissions[key],
                    isFetching: true,
                    hasAttempted: false,
                    permissions: [],
                    error: "",
                };
            })
            .addCase(fetchResourcePermissions.fulfilled, (state, { meta, payload }) => {
                const key = makeResourceKey(meta.arg.resource);
                state.resourcePermissions[key] = {
                    ...state.resourcePermissions[key],
                    isFetching: false,
                    hasAttempted: true,
                    permissions: payload?.result ?? [],
                };
            })
            .addCase(fetchResourcePermissions.rejected, (state, { meta, payload, error }) => {
                const key = makeResourceKey(meta.arg.resource);
                if (error) console.error(error);
                state.resourcePermissions[key] = {
                    ...state.resourcePermissions[key],
                    isFetching: false,
                    hasAttempted: true,
                    error:
                        payload?.error ??
                        error.message ??
                        "An error occurred while fetching permissions for a resource",
                };
            });
    },
});

export const { signOut } = authSlice.actions;
export default authSlice.reducer;
