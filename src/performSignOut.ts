import { useDispatch, useSelector } from "react-redux";

import { useOpenIdConfig } from "./hooks";
import { RootState } from "./redux/store";
import { setLSNotSignedIn } from "./performAuth";
import { signOut } from "./redux/authSlice";

export const usePerformSignOut = (bentoUrl: string, openIdConfigUrl: string, clientId: string) => {
    const dispatch = useDispatch();
    const { idToken } = useSelector((state: RootState) => state.auth);
    const openIdConfig = useOpenIdConfig(openIdConfigUrl);

    return () => {
        const endSessionEndpoint: string | undefined = openIdConfig?.end_session_endpoint;
        if (!endSessionEndpoint) {
            dispatch(signOut());
        } else {
            // Sign-out supported, so do that.
            const endSessionUrl = new URL(endSessionEndpoint);
            if (idToken) {
                endSessionUrl.searchParams.append("id_token_hint", idToken);
            }
            endSessionUrl.searchParams.append("client_id", clientId);
            endSessionUrl.searchParams.append("post_logout_redirect_uri", bentoUrl.replace(/\/$/, "") + "/");
            setLSNotSignedIn(); // Make sure we don't immediately try to sign in again
            window.location.href = endSessionUrl.toString();
        }
    };
};
