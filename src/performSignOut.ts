import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";

import { useBentoAuthContext } from "./contexts";
import { useOpenIdConfig } from "./hooks";
import { setLSNotSignedIn } from "./performAuth";
import { signOut } from "./redux/authSlice";
import { logMissingAuthContext } from "./utils";

import type { RootState } from "./redux/store";

export const usePerformSignOut = () => {
    const dispatch = useDispatch();
    const { clientId, postSignOutUrl } = useBentoAuthContext();
    const { idToken } = useSelector((state: RootState) => state.auth);
    const openIdConfig = useOpenIdConfig();
    const endSessionEndpoint = openIdConfig?.end_session_endpoint;

    return useCallback(() => {
        if (!clientId || !postSignOutUrl) {
            logMissingAuthContext("clientId", "postSignOutUrl");
            return;
        }

        if (!endSessionEndpoint) {
            dispatch(signOut());
            return;
        }

        // Sign-out supported, so do that.
        const endSessionUrl = new URL(endSessionEndpoint);
        if (idToken) {
            endSessionUrl.searchParams.append("id_token_hint", idToken);
        }
        endSessionUrl.searchParams.append("client_id", clientId);
        endSessionUrl.searchParams.append("post_logout_redirect_uri", postSignOutUrl);
        setLSNotSignedIn(); // Make sure we don't immediately try to sign in again
        window.location.href = endSessionUrl.toString();
    }, [dispatch, clientId, postSignOutUrl, idToken, openIdConfig, endSessionEndpoint]);
};
