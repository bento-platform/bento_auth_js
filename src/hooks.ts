import { MutableRefObject, useCallback, useEffect, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AnyAction } from "redux";
import { ThunkAction } from "redux-thunk";

import { Resource, makeResourceKey } from "./resources";
import { fetchResourcePermissions, refreshTokens, tokenHandoff } from "./redux/authSlice";
import { RootState } from "./redux/store";
import { LS_SIGN_IN_POPUP, createAuthURL } from "./performAuth";
import { fetchOpenIdConfigurationIfNecessary } from "./redux/openIdConfigSlice";
import { getIsAuthenticated, makeAuthorizationHeader } from "./utils";

const AUTH_RESULT_TYPE = "authResult";

type MessageHandlerFunc = (e: MessageEvent) => void;

export const useIsAuthenticated = () => {
    const { idTokenContents } = useSelector((state: RootState) => state.auth);
    return getIsAuthenticated(idTokenContents);
};

export const useAccessToken = () => useSelector((state: RootState) => state.auth.accessToken);

export const useAuthorizationHeader = () => {
    const accessToken = useAccessToken();
    return useMemo(() => makeAuthorizationHeader(accessToken), [accessToken]);
};

export const useResourcePermissions = (resource: Resource, authzUrl: string) => {
    const dispatch = useDispatch();

    const haveAuthorizationService = !!authzUrl;

    const key = useMemo(() => makeResourceKey(resource), [resource]);

    const { permissions, isFetching, hasAttempted, error } =
        useSelector((state: RootState) => state.auth.resourcePermissions?.[key]) ?? {};

    useEffect(() => {
        if (!haveAuthorizationService || isFetching || permissions || hasAttempted) return;
        dispatch(fetchResourcePermissions({ resource, authzUrl }));
    }, [
        dispatch,
        haveAuthorizationService,
        isFetching,
        permissions,
        hasAttempted,
        resource,
        authzUrl,
    ]);

    return {
        permissions: permissions ?? [],
        isFetching: isFetching ?? false,
        hasAttempted: hasAttempted ?? false,
        error: error ?? "",
    };
};

export const useHasResourcePermission = (resource: Resource, authzUrl: string, permission: string) => {
    const { permissions, isFetching } = useResourcePermissions(resource, authzUrl) ?? {};
    return { isFetching, hasPermission: permissions.includes(permission) };
};

export const useOpenIdConfig = (openIdConfigUrl: string) => {
    const dispatch = useDispatch();

    useEffect(() => {
        dispatch(fetchOpenIdConfigurationIfNecessary(openIdConfigUrl));
    }, [dispatch, openIdConfigUrl]);

    return useSelector((state: RootState) => state.openIdConfiguration.data);
};

export const useSignInPopupTokenHandoff = (
    applicationUrl: string,
    authCallbackUrl: string,
    clientId: string,
    windowMessageHandler: MutableRefObject<null | MessageHandlerFunc>
) => {
    const dispatch = useDispatch();
    useEffect(() => {
        windowMessageHandler.current = (e: MessageEvent) => {
            if (e.origin !== applicationUrl) return;
            if (e.data?.type !== AUTH_RESULT_TYPE) return;
            const { code, verifier } = e.data ?? {};
            if (!code || !verifier) return;
            localStorage.removeItem(LS_SIGN_IN_POPUP);
            dispatch(tokenHandoff({ code, verifier, clientId, authCallbackUrl }));
        };
        window.addEventListener("message", windowMessageHandler.current);

        // Listener cleanup
        return () => {
            if (windowMessageHandler.current) {
                window.removeEventListener("message", windowMessageHandler.current);
            }   
        };
    }, [dispatch, applicationUrl, authCallbackUrl, clientId]);
};

export const useSessionWorkerTokenRefresh = (
    clientId: string,
    sessionWorkerRef: MutableRefObject<null | Worker>,
    createWorker: () => Worker,
    fetchUserDependentData: ThunkAction<void, RootState, unknown, AnyAction>,
) => {
    const dispatch = useDispatch();
    useEffect(() => {
        if (!sessionWorkerRef.current) {
            const sw = createWorker();
            sw.addEventListener("message", () => {
                dispatch(refreshTokens(clientId));
                dispatch(fetchUserDependentData);
            });
            sessionWorkerRef.current = sw;
        }

        return () => {
            if (sessionWorkerRef.current) {
                sessionWorkerRef.current.terminate();
                sessionWorkerRef.current = null;
            }
        };
    }, [dispatch, createWorker, fetchUserDependentData, clientId]);
};

export const useOpenSignInWindowCallback = (
    signInWindow: MutableRefObject<null | Window>,
    clientId: string,
    openIdConfigUrl: string,
    authCallbackUrl: string,
    windowFeatures = "scrollbars=no, toolbar=no, menubar=no, width=800, height=600"
) => {
    const openIdConfig = useOpenIdConfig(openIdConfigUrl);
    return useCallback(() => {
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
    }, [openIdConfig, clientId, authCallbackUrl, windowFeatures]);
};

export const usePopupOpenerAuthCallback = (applicationUrl: string) => {
    return useCallback(async (code: string, verifier: string) => {
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
