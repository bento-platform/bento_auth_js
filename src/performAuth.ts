import { useCallback, useEffect } from "react";
import { useDispatch } from "react-redux";
import { useNavigate, useLocation } from "react-router-dom";

import { DEFAULT_AUTH_SCOPE, useBentoAuthContext } from "./contexts";
import { useIsAuthenticated, useOpenIdConfig } from "./hooks";
import { PKCE_LS_STATE, PKCE_LS_VERIFIER, pkceChallengeFromVerifier, secureRandomString } from "./pkce";
import { tokenHandoff } from "./redux/authSlice";
import { buildUrlEncodedData, logMissingAuthContext, popLocalStorageItem } from "./utils";

import type { AppDispatch } from "./redux/store";

export const LS_SIGN_IN_POPUP = "BENTO_DID_CREATE_SIGN_IN_POPUP";
export const LS_BENTO_WAS_SIGNED_IN = "BENTO_WAS_SIGNED_IN";
export const LS_BENTO_POST_AUTH_REDIRECT = "BENTO_POST_AUTH_REDIRECT";

const DEFAULT_REDIRECT = "/overview";

export const createAuthURL = async (
    authorizationEndpoint: string,
    clientId: string,
    authCallbackUrl: string,
    scope = "openid email",
) => {
    const state = secureRandomString();
    const verifier = secureRandomString();

    localStorage.setItem(PKCE_LS_STATE, state);
    localStorage.setItem(PKCE_LS_VERIFIER, verifier);

    localStorage.setItem(LS_BENTO_POST_AUTH_REDIRECT, `${window.location.pathname}${window.location.search}`);

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

export const performAuth = async (
    authorizationEndpoint: string,
    clientId: string,
    authCallbackUrl: string,
    scope = "openid email",
) => {
    window.location.href = await createAuthURL(authorizationEndpoint, clientId, authCallbackUrl, scope);
};

export const usePerformAuth = () => {
    const { authCallbackUrl, clientId, scope } = useBentoAuthContext();
    const { data: openIdConfig } = useOpenIdConfig();
    const authorizationEndpoint = openIdConfig?.["authorization_endpoint"];
    return useCallback(async () => {
        if (!authCallbackUrl || !clientId) {
            logMissingAuthContext("authCallbackUrl", "clientId");
            throw new Error("Could not create auth URL; missing authCallbackUrl or clientId");
        }
        if (!authorizationEndpoint) throw new Error("Could not create auth URL; missing authorization_endpoint");
        window.location.href = await createAuthURL(
            authorizationEndpoint,
            clientId,
            authCallbackUrl,
            scope ?? DEFAULT_AUTH_SCOPE,
        );
    }, [authCallbackUrl, clientId, authorizationEndpoint, scope]);
};

export type AuthCodeCallbackFunction = (code: string, verifier: string) => Promise<void>;

const useDefaultAuthCodeCallback = (
    onSuccessfulAuthentication: (() => Promise<unknown>) | (() => unknown),
): AuthCodeCallbackFunction => {
    const dispatch: AppDispatch = useDispatch();
    const navigate = useNavigate();
    const { authCallbackUrl, clientId } = useBentoAuthContext();

    return useCallback(
        async (code: string, verifier: string) => {
            if (!authCallbackUrl || !clientId) {
                logMissingAuthContext("authCallbackUrl", "clientId");
                return;
            }

            const lastPath = popLocalStorageItem(LS_BENTO_POST_AUTH_REDIRECT);
            await dispatch(tokenHandoff({ code, verifier, clientId, authCallbackUrl }));
            navigate(lastPath ?? DEFAULT_REDIRECT, { replace: true });
            await onSuccessfulAuthentication();
        },
        [dispatch, navigate, authCallbackUrl, clientId, onSuccessfulAuthentication],
    );
};

export const setLSNotSignedIn = () => {
    localStorage.removeItem(LS_BENTO_WAS_SIGNED_IN);
};

export const useHandleCallback = (
    callbackPath: string,
    onSuccessfulAuthentication: (() => Promise<unknown>) | (() => unknown),
    authCodeCallback: AuthCodeCallbackFunction | undefined = undefined,
    uiErrorCallback: (message: string) => void,
) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { authCallbackUrl, clientId } = useBentoAuthContext();
    const { data: oidcConfig } = useOpenIdConfig();
    const isAuthenticated = useIsAuthenticated();
    const defaultAuthCodeCallback = useDefaultAuthCodeCallback(onSuccessfulAuthentication);

    useEffect(() => {
        // Not used directly in this effect, but if we don't have it our auth callback / token handoff presumably won't
        // work properly, so we terminate early.
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
    }, [
        authCallbackUrl,
        authCodeCallback,
        callbackPath,
        clientId,
        defaultAuthCodeCallback,
        isAuthenticated,
        location,
        navigate,
        oidcConfig,
        uiErrorCallback,
    ]);
};

export const checkIsInAuthPopup = (applicationUrl: string): boolean => {
    try {
        const didCreateSignInPopup = localStorage.getItem(LS_SIGN_IN_POPUP);
        return window.opener && window.opener.origin === applicationUrl && didCreateSignInPopup === "true";
    } catch {
        return false;
    }
};
