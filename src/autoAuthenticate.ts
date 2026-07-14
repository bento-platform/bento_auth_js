import { useEffect } from "react";
import { useAuthState, useIsAuthenticated, useIsAutoAuthenticating, useOpenIdConfig } from "./hooks";
import { LS_BENTO_WAS_SIGNED_IN, setLSNotSignedIn, usePerformAuth } from "./performAuth";
import { useBentoAuthContext } from "./contexts";
import { refreshTokens, setIsAutoAuthenticating } from "./redux/authSlice";
import { useAppDispatch } from "./redux/store";

export interface AutoAuthenticateState {
    isAutoAuthenticating: boolean;
}

export const useAutoAuthenticate = (): AutoAuthenticateState => {
    const dispatch = useAppDispatch();

    const isAutoAuthenticating = useIsAutoAuthenticating();

    const isAuthenticated = useIsAuthenticated();
    const { data: openIdConfig } = useOpenIdConfig();
    const performAuth = usePerformAuth();

    const { refreshToken } = useAuthState();
    const { clientId } = useBentoAuthContext();

    const authzEndpoint = openIdConfig?.["authorization_endpoint"];

    useEffect(() => {
        if (
            !isAuthenticated &&
            !isAutoAuthenticating &&
            authzEndpoint &&
            localStorage.getItem(LS_BENTO_WAS_SIGNED_IN) === "true"
        ) {
            console.debug("auto-authenticating");
            setLSNotSignedIn();
            dispatch(setIsAutoAuthenticating(true));

            if (refreshToken && clientId) {
                // We already have a refresh token, so try a silent refresh first - no redirect, no /callback hop.
                dispatch(refreshTokens(clientId))
                    .unwrap()
                    .then(() => {
                        dispatch(setIsAutoAuthenticating(false));
                    })
                    .catch((err) => {
                        console.error(err);
                        // Refresh token is dead - fall back to the full redirect flow.
                        performAuth().catch((err2) => {
                            console.error(err2);
                            localStorage.removeItem(LS_BENTO_WAS_SIGNED_IN);
                            dispatch(setIsAutoAuthenticating(false));
                        });
                    });
                return;
            }

            // If performAuth() is successful, there will be a redirect. Otherwise, an error will be thrown and
            // isAutoAuthenticating will be reset to `false`.
            performAuth().catch((err) => {
                console.error(err);
                // Prevent loop: set auto-authenticating to false and unset localStorage LS_BENTO_WAS_SIGNED_IN
                //  - Without setting localStorage, this would trigger the effect to run again.
                localStorage.removeItem(LS_BENTO_WAS_SIGNED_IN);
                dispatch(setIsAutoAuthenticating(false));
            });
        }
    }, [dispatch, authzEndpoint, isAuthenticated, isAutoAuthenticating, performAuth, refreshToken, clientId]);

    return { isAutoAuthenticating };
};
