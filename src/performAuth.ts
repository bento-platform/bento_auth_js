import { useCallback, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { AnyAction } from "redux";
import { ThunkAction } from "redux-thunk";

import { DEFAULT_AUTH_SCOPE, useBentoAuthContext } from "./contexts";
import { useIsAuthenticated, useOpenIdConfig } from "./hooks";
import { PKCE_LS_STATE, PKCE_LS_VERIFIER, pkceChallengeFromVerifier, secureRandomString } from "./pkce";
import { tokenHandoff } from "./redux/authSlice";
import { AppDispatch, RootState } from "./redux/store";
import { buildUrlEncodedData, getIsAuthenticated, logMissingAuthContext, popLocalStorageItem } from "./utils";

export const LS_SIGN_IN_POPUP = "BENTO_DID_CREATE_SIGN_IN_POPUP";
export const LS_BENTO_WAS_SIGNED_IN = "BENTO_WAS_SIGNED_IN";
export const LS_BENTO_POST_AUTH_REDIRECT = "BENTO_POST_AUTH_REDIRECT";

const DEFAULT_REDIRECT = "/overview";

export const createAuthURL = async (authorizationEndpoint: string, clientId: string, authCallbackUrl: string, scope = "openid email") => {
    const state = secureRandomString();
    const verifier = secureRandomString();

    localStorage.setItem(PKCE_LS_STATE, state);
    localStorage.setItem(PKCE_LS_VERIFIER, verifier);

    localStorage.setItem(LS_BENTO_POST_AUTH_REDIRECT, window.location.pathname);

    return (
        `${authorizationEndpoint}?` +
        buildUrlEncodedData({
            response_type: "code",
            client_id: clientId,
            state,
            scope,
            redirect_uri: authCallbackUrl,
            code_challenge: await pkceChallengeFromVerifier(verifier),
            code_challenge_method: "S256",
        }).toString()
    );
};

export const performAuth = async (authorizationEndpoint: string, clientId: string, authCallbackUrl: string, scope = "openid email") => {
    window.location.href = await createAuthURL(authorizationEndpoint, clientId, authCallbackUrl, scope);
};

export const usePerformAuth = () => {
    const { authCallbackUrl, clientId, scope } = useBentoAuthContext();
    const openIdConfig = useOpenIdConfig();
    const authorizationEndpoint = openIdConfig?.["authorization_endpoint"];
    return useCallback(async () => {
        if (!authCallbackUrl || !clientId) {
            logMissingAuthContext("authCallbackUrl", "clientId");
            return;
        }
        if (!authorizationEndpoint) return;
        window.location.href = await createAuthURL(
            authorizationEndpoint, clientId, authCallbackUrl, scope ?? DEFAULT_AUTH_SCOPE);
    }, [authCallbackUrl, clientId, authorizationEndpoint]);
};

export type AuthCodeCallbackFunction = (code: string, verifier: string) => Promise<void>;

const useDefaultAuthCodeCallback = (
    onSuccessfulAuthentication: ThunkAction<void, RootState, unknown, AnyAction>,
): AuthCodeCallbackFunction => {
    const dispatch: AppDispatch = useDispatch();
    const navigate = useNavigate();
    const { authCallbackUrl, clientId } = useBentoAuthContext();

    return useCallback(async (code: string, verifier: string) => {
        const lastPath = popLocalStorageItem(LS_BENTO_POST_AUTH_REDIRECT);
        await dispatch(tokenHandoff({ code, verifier, clientId, authCallbackUrl }));
        navigate(lastPath ?? DEFAULT_REDIRECT, { replace: true });
        await dispatch(onSuccessfulAuthentication);
    }, [dispatch]);
};

export const setLSNotSignedIn = () => {
    localStorage.removeItem(LS_BENTO_WAS_SIGNED_IN);
};

export const useHandleCallback = (
    callbackPath: string,
    onSuccessfulAuthentication: ThunkAction<void, RootState, unknown, AnyAction>,
    authCodeCallback: AuthCodeCallbackFunction | undefined = undefined,
    uiErrorCallback: (message: string) => void,
) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { authCallbackUrl, clientId } = useBentoAuthContext();
    const oidcConfig = useOpenIdConfig();
    const isAuthenticated = useIsAuthenticated()
    const defaultAuthCodeCallback = useDefaultAuthCodeCallback(onSuccessfulAuthentication);

    useEffect(() => {
        if (!authCallbackUrl || !clientId) {
            logMissingAuthContext("authCallbackUrl", "clientId");
            return;
        }

        // Ignore non-callback URLs
        if (!location.pathname.startsWith(callbackPath)) return;

        // End early if we don't have OpenID config (yet)
        if (!oidcConfig) return;

        // If we're already authenticated, don't try to reauthenticate
        if (isAuthenticated) {
            navigate(DEFAULT_REDIRECT, { replace: true });
            return;
        }

        const params = new URLSearchParams(window.location.search);

        const error = params.get("error");
        if (error) {
            uiErrorCallback(`Error encountered during sign-in: ${error}`);
            console.error(error);
            setLSNotSignedIn();
            return;
        }

        const code = params.get("code");
        if (!code) {
            // No code, don't do anything
            setLSNotSignedIn();
            return;
        }

        const localState = popLocalStorageItem(PKCE_LS_STATE);
        if (!localState) {
            console.error("no local state");
            setLSNotSignedIn();
            return;
        }

        const paramState = params.get("state");
        if (localState !== paramState) {
            console.error("state mismatch");
            setLSNotSignedIn();
            return;
        }

        const verifier = popLocalStorageItem(PKCE_LS_VERIFIER) ?? "";

        (authCodeCallback ?? defaultAuthCodeCallback)(code, verifier).catch((err) => {
            console.error(err);
            setLSNotSignedIn();
        });
    }, [location, navigate, oidcConfig, defaultAuthCodeCallback, isAuthenticated]);
};

export const checkIsInAuthPopup = (applicationUrl: string): boolean => {
    try {
        const didCreateSignInPopup = localStorage.getItem(LS_SIGN_IN_POPUP);
        return (
            window.opener && window.opener.origin === applicationUrl && didCreateSignInPopup === "true"
        );
    } catch {
        return false;
    }
};

