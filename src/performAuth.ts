import { useCallback, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useHistory, useLocation } from "react-router-dom";
import { AnyAction } from "redux";
import { ThunkAction } from "redux-thunk";

import { DEFAULT_AUTH_SCOPE, useBentoAuthContext } from "./contexts";
import { useOpenIdConfig } from "./hooks";
import { PKCE_LS_STATE, PKCE_LS_VERIFIER, pkceChallengeFromVerifier, secureRandomString } from "./pkce";
import { tokenHandoff } from "./redux/authSlice";
import { RootState, useAppDispatch } from "./redux/store";
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

const defaultAuthCodeCallback = async (
    dispatch: ReturnType<typeof useAppDispatch>,
    history: ReturnType<typeof useHistory>,
    code: string,
    verifier: string,
    onSuccessfulAuthentication: ThunkAction<void, RootState, unknown, AnyAction>,
    clientId: string,
    authCallbackUrl: string,
) => {
    const lastPath = popLocalStorageItem(LS_BENTO_POST_AUTH_REDIRECT);
    await dispatch(tokenHandoff({ code, verifier, clientId, authCallbackUrl }));
    history.replace(lastPath ?? DEFAULT_REDIRECT);
    await dispatch(onSuccessfulAuthentication);
};

export const setLSNotSignedIn = () => {
    localStorage.removeItem(LS_BENTO_WAS_SIGNED_IN);
};


export const useHandleCallback = (
    callbackPath: string,
    onSuccessfulAuthentication: ThunkAction<void, RootState, unknown, AnyAction>,
    clientId: string,
    authCallbackUrl: string,
    authCodeCallback = undefined,
    uiErrorCallback: (message: string) => void,
) => {
    const dispatch = useDispatch();
    const history = useHistory();
    const location = useLocation();
    const oidcConfig = useSelector((state: RootState) => state.openIdConfiguration.data);
    const idTokenContents = useSelector((state: RootState) => state.auth.idTokenContents);
    const isAuthenticated = getIsAuthenticated(idTokenContents);

    useEffect(() => {
        // Ignore non-callback URLs
        if (!location.pathname.startsWith(callbackPath)) return;

        // End early if we don't have OpenID config (yet)
        if (!oidcConfig) return;

        // If we're already authenticated, don't try to reauthenticate
        if (isAuthenticated) {
            history.replace(DEFAULT_REDIRECT);
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

        (authCodeCallback ?? defaultAuthCodeCallback)(
            dispatch,
            history,
            code,
            verifier,
            onSuccessfulAuthentication,
            clientId,
            authCallbackUrl
        ).catch((err) => {
            console.error(err);
            setLSNotSignedIn();
        });
    }, [location, history, oidcConfig]);
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
