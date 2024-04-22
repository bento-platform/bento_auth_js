import { useEffect } from "react";
import { useIsAuthenticated, useIsAutoAuthenticating, useOpenIdConfig } from "./hooks";
import { LS_BENTO_WAS_SIGNED_IN, setLSNotSignedIn, usePerformAuth } from "./performAuth";
import { setIsAutoAuthenticating } from "./redux/authSlice";
import { useAppDispatch } from "./redux/store";

export interface AutoAuthenticateState {
    isAutoAuthenticating: boolean;
}

export const useAutoAuthenticate = (): AutoAuthenticateState => {
    const dispatch = useAppDispatch();

    const isAutoAuthenticating = useIsAutoAuthenticating();

    const isAuthenticated = useIsAuthenticated();
    const openIdConfig = useOpenIdConfig();
    const performAuth = usePerformAuth();

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
            performAuth().catch(console.error);
        }
    }, [authzEndpoint, isAuthenticated, isAutoAuthenticating]);

    return { isAutoAuthenticating };
};
