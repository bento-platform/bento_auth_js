import { MutableRefObject, useCallback, useEffect, useMemo, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AnyAction } from "redux";
import { ThunkAction } from "redux-thunk";

import { useBentoAuthContext } from "./contexts";
import { Resource, makeResourceKey } from "./resources";
import { AuthSliceState, fetchResourcesPermissions, refreshTokens, tokenHandoff } from "./redux/authSlice";
import { LS_SIGN_IN_POPUP, createAuthURL } from "./performAuth";
import { fetchOpenIdConfigurationIfNecessary, type OIDCSliceState } from "./redux/openIdConfigSlice";
import { getIsAuthenticated, logMissingAuthContext, makeAuthorizationHeader } from "./utils";

import type { AppDispatch, RootState  } from "./redux/store";

const AUTH_RESULT_TYPE = "authResult";

type MessageHandlerFunc = (e: MessageEvent) => void;

export const useAuthState = (): AuthSliceState => useSelector((state: RootState) => state.auth);

export const useIsAuthenticated = () => {
    const { idTokenContents } = useAuthState();
    return getIsAuthenticated(idTokenContents);
};

export const useAccessToken = () => useAuthState().accessToken;

export const useAuthorizationHeader = () => {
    const accessToken = useAccessToken();
    return useMemo(() => makeAuthorizationHeader(accessToken), [accessToken]);
};

export const useIsAutoAuthenticating = () => useAuthState().isAutoAuthenticating;

export const useResourcesPermissions = (resources: Resource[], authzUrl: string | undefined) => {
    const dispatch: AppDispatch = useDispatch();

    const keys = useMemo(() => resources.map((resource) => makeResourceKey(resource)), [resources]);

    const { resourcePermissions } = useAuthState();

    useEffect(() => {
        const anyFetching = keys.some((key) => !!resourcePermissions[key]?.isFetching);
        const allHavePermissions = keys.every((key) => !!resourcePermissions[key]?.permissions?.length);
        const allAttempted = keys.every((key) => !!resourcePermissions[key]?.hasAttempted);

        // If any permissions are currently fetching, or all requested permissions have already been tried/returned, we
        // don't need to dispatch the fetch action:
        if (!authzUrl || anyFetching || allHavePermissions || allAttempted) return;

        dispatch(fetchResourcesPermissions({ resources, authzUrl }));
    }, [
        dispatch,
        keys,
        resources,
        resourcePermissions,
        authzUrl,
    ]);

    // Construct an object with resource keys yielding an object containing the permissions on the object
    return useMemo(() => Object.fromEntries(keys.map((key) => {
        const { permissions, isFetching, hasAttempted, error } = resourcePermissions[key] ?? {};
        return [
            key,
            {
                permissions: permissions ?? [],
                isFetching: isFetching ?? false,
                hasAttempted: hasAttempted ?? false,
                error: error ?? "",
            },
        ];
    })), [keys, resourcePermissions]);
};

export const useResourcePermissions = (resource: Resource, authzUrl: string | undefined) => {
    const key = makeResourceKey(resource);
    const resourcesPermissions = useResourcesPermissions([resource], authzUrl);
    return resourcesPermissions[key];
};

export const useHasResourcePermission = (resource: Resource, authzUrl: string | undefined, permission: string) => {
    const { permissions, isFetching } = useResourcePermissions(resource, authzUrl) ?? {};
    return { isFetching, hasPermission: permissions.includes(permission) };
};

export const useOpenIdConfig = (): OIDCSliceState => {
    const dispatch: AppDispatch = useDispatch();
    const { openIdConfigUrl } = useBentoAuthContext();

    useEffect(() => {
        if (!openIdConfigUrl) {
            logMissingAuthContext("openIdConfigUrl");
            return;
        }
        dispatch(fetchOpenIdConfigurationIfNecessary(openIdConfigUrl));
    }, [dispatch, openIdConfigUrl]);

    return useSelector((state: RootState) => state.openIdConfiguration);
};

export const useSignInPopupTokenHandoff = (
    windowMessageHandler: MutableRefObject<null | MessageHandlerFunc>
) => {
    const dispatch: AppDispatch = useDispatch();
    const { applicationUrl, authCallbackUrl, clientId } = useBentoAuthContext();
    useEffect(() => {
        if (!applicationUrl || !authCallbackUrl || !clientId) {
            logMissingAuthContext("applicationUrl", "authCallbackUrl", "clientId");
        } else {
            windowMessageHandler.current = (e: MessageEvent) => {
                if (e.origin !== applicationUrl) return;
                if (e.data?.type !== AUTH_RESULT_TYPE) return;
                const { code, verifier } = e.data ?? {};
                if (!code || !verifier) return;
                localStorage.removeItem(LS_SIGN_IN_POPUP);
                dispatch(tokenHandoff({ code, verifier, clientId, authCallbackUrl }));
            };
            window.addEventListener("message", windowMessageHandler.current);
        }

        // Listener cleanup
        return () => {
            if (windowMessageHandler.current) {
                window.removeEventListener("message", windowMessageHandler.current);
            }   
        };
    }, [dispatch, applicationUrl, authCallbackUrl, clientId, windowMessageHandler]);
};

export const useSessionWorkerTokenRefresh = (
    sessionWorkerRef: MutableRefObject<null | Worker>,
    createWorker: () => Worker,
    fetchUserDependentData: ThunkAction<void, RootState, unknown, AnyAction>,
) => {
    const dispatch: AppDispatch = useDispatch();
    const { clientId } = useBentoAuthContext();

    const { refreshToken } = useAuthState();

    const refreshTokenRef = useRef<string | undefined>(refreshToken);

    useEffect(() => {
        // A bit hacky: we use a ref to get the refreshToken into the worker event listener without triggering a
        // dependency change for the useEffect below.
        refreshTokenRef.current = refreshToken;
    }, [refreshToken]);

    useEffect(() => {
        if (!clientId) {
            logMissingAuthContext("clientId");
        } else {
            if (!sessionWorkerRef.current) {
                const sw = createWorker();
                sw.addEventListener("message", () => {
                    // It would be nice to check if we have a refresh token here without refs, but doing so would mean
                    // unbinding and re-binding the listener every time the effect is re-executed. Instead, we can use a
                    // ref to access the token without triggering a hook dependency change.
                    // While the action itself also handles the no refresh token case, it pollutes the Redux and console
                    // logs and so it's nicer to re-check here.
                    if (refreshTokenRef.current) dispatch(refreshTokens(clientId));
                    dispatch(fetchUserDependentData);
                });
                sessionWorkerRef.current = sw;
            }
        }

        return () => {
            if (sessionWorkerRef.current) {
                sessionWorkerRef.current.terminate();
                sessionWorkerRef.current = null;
            }
        };
    }, [dispatch, createWorker, fetchUserDependentData, clientId, sessionWorkerRef]);
};

export const useOpenSignInWindowCallback = (
    signInWindow: MutableRefObject<null | Window>,
    windowFeatures = "scrollbars=no, toolbar=no, menubar=no, width=800, height=600"
) => {
    const { clientId, authCallbackUrl } = useBentoAuthContext();
    const { data: openIdConfig } = useOpenIdConfig();
    return useCallback(() => {
        if (!clientId || !authCallbackUrl) {
            logMissingAuthContext("clientId", "authCallbackUrl");
            return;
        }

        if (signInWindow.current && !signInWindow.current.closed) {
            signInWindow.current.focus();
            return;
        }
    
        if (!openIdConfig || !window.top) return;
    
        const popupTop = window.top.outerHeight / 2 + window.top.screenY - 350;
        const popupLeft = window.top.outerWidth / 2 + window.top.screenX - 400;
    
        (async () => {
            localStorage.setItem(LS_SIGN_IN_POPUP, "true");
            signInWindow.current = window.open(
                await createAuthURL(openIdConfig["authorization_endpoint"], clientId, authCallbackUrl),
                "Bento Sign In",
                `${windowFeatures}, top=${popupTop}, left=${popupLeft}`,
            );
        })();
    }, [openIdConfig, clientId, authCallbackUrl, windowFeatures, signInWindow]);
};

export const usePopupOpenerAuthCallback = () => {
    const { applicationUrl } = useBentoAuthContext();
    return useCallback(async (code: string, verifier: string) => {
        if (!applicationUrl) {
            logMissingAuthContext("applicationUrl");
            return;
        }

        if (!window.opener) return;

        // We're inside a popup window for authentication
    
        // Send the code and verifier to the main thread/page for authentication
        // IMPORTANT SECURITY: provide BENTO_URL as the target origin:
        window.opener.postMessage({ type: "authResult", code, verifier }, applicationUrl);
    
        // We're inside a popup window which has successfully re-authenticated the user, meaning we need to
        // close ourselves to return focus to the original window.
        window.close();
    }, [applicationUrl]);
};
