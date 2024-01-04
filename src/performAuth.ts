import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useLocation } from "react-router-dom";

import { tokenHandoff } from "./redux/authSlice";
import { RootState, useAppDispatch} from "./redux/store";

import { buildUrlEncodedData, getIsAuthenticated, popLocalStorageItem, nop } from "./utils";
import { PKCE_LS_STATE, PKCE_LS_VERIFIER, pkceChallengeFromVerifier, secureRandomString } from "./pkce";

export const LS_SIGN_IN_POPUP = "BENTO_DID_CREATE_SIGN_IN_POPUP";
export const LS_BENTO_WAS_SIGNED_IN = "BENTO_WAS_SIGNED_IN";
export const LS_BENTO_POST_AUTH_REDIRECT = "BENTO_POST_AUTH_REDIRECT";

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

const DEFAULT_REDIRECT = "/overview";

export const performAuth = async (authorizationEndpoint: string, clientId: string, authCallbackUrl: string, scope = "openid email") => {
    window.location.href = await createAuthURL(authorizationEndpoint, clientId, authCallbackUrl, scope);
};

const defaultAuthCodeCallback = async (
    dispatch: ReturnType<typeof useAppDispatch>,
    navigate: ReturnType<typeof useNavigate>,
    code: string,
    verifier: string,
    onSuccessfulAuthentication: CallableFunction,
    clientId: string,
    authCallbackUrl: string,
) => {
    const lastPath = popLocalStorageItem(LS_BENTO_POST_AUTH_REDIRECT);
    await dispatch(tokenHandoff({ code, verifier, clientId, authCallbackUrl }))
    navigate(lastPath ?? DEFAULT_REDIRECT, { replace: true });
    await dispatch(onSuccessfulAuthentication(nop));
};

export const setLSNotSignedIn = () => {
    localStorage.removeItem(LS_BENTO_WAS_SIGNED_IN);
};

export const useHandleCallback = (
    callbackPath: string,
    onSuccessfulAuthentication: CallableFunction,
    clientId: string,
    authCallbackUrl: string,
    authCodeCallback: typeof defaultAuthCodeCallback | undefined = undefined
) => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const location = useLocation();
    const oidcConfig = useSelector((state: RootState) => state.openIdConfiguration.data);
    const idTokenContents = useSelector((state: RootState) => state.auth.idTokenContents);
    const isAuthenticated = getIsAuthenticated(idTokenContents);

    console.log("useHandleCallback - Entry", { callbackPath, oidcConfig, isAuthenticated, idTokenContents });


        console.log("useHandleCallback - useEffect triggered", { pathname: location.pathname, oidcConfig });

        // Ignore non-callback URLs
        if (!location.pathname.startsWith(callbackPath)) {
            console.log("useHandleCallback - Ignoring non-callback URL");
            return;
        }

        // End early if we don't have OpenID config (yet)
        if (!oidcConfig) {
            console.log("useHandleCallback - No OpenID config available");
            return;
        }

        // If we're already authenticated, don't try to reauthenticate
        if (isAuthenticated) {
            console.log("useHandleCallback - Already authenticated, navigating to default redirect");
            navigate(DEFAULT_REDIRECT, { replace: true });
            return;
        }

        const params = new URLSearchParams(window.location.search);
        console.log("useHandleCallback - URLSearchParams", params.toString());

        const error = params.get("error");
        if (error) {
            console.error("useHandleCallback - Error in URL params", error);
            setLSNotSignedIn();
            return;
        }

        const code = params.get("code");
        if (!code) {
            console.log("useHandleCallback - No code in URL params");
            setLSNotSignedIn();
            return;
        }

        const localState = popLocalStorageItem(PKCE_LS_STATE);
        if (!localState) {
            console.error("useHandleCallback - No local state");
            setLSNotSignedIn();
            return;
        }

        const paramState = params.get("state");
        if (localState !== paramState) {
            console.error("useHandleCallback - State mismatch");
            setLSNotSignedIn();
            return;
        }

        const verifier = popLocalStorageItem(PKCE_LS_VERIFIER) ?? "";
        console.log("useHandleCallback - Proceeding with auth code callback", { code, verifier });

        (authCodeCallback ?? defaultAuthCodeCallback)(
            dispatch,
            navigate,
            code,
            verifier,
            onSuccessfulAuthentication,
            clientId,
            authCallbackUrl
        ).catch((err) => {
            console.error("useHandleCallback - Error during auth code callback", err);
            setLSNotSignedIn();
        });

    console.log("useHandleCallback - Effect set");
};

