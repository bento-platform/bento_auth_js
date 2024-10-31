import React, { createContext, useContext } from "react";

export interface BentoAuthContextObject {
    applicationUrl: string;
    openIdConfigUrl: string;
    clientId: string;
    scope: string;
    // Application URLs:
    postSignOutUrl: string;
    authCallbackUrl: string;
}

export const DEFAULT_AUTH_SCOPE = "openid email";

const defaultContextObject: BentoAuthContextObject = {
    applicationUrl: "", // default must be false-y for 'missing context' error detection
    openIdConfigUrl: "", // default must be false-y for 'missing context' error detection
    clientId: "", // default must be false-y for 'missing context' error detection
    scope: DEFAULT_AUTH_SCOPE,
    postSignOutUrl: "", // default must be false-y for 'missing context' error detection
    authCallbackUrl: "", // default must be false-y for 'missing context' error detection
};

export const BentoAuthContext = createContext<BentoAuthContextObject>(defaultContextObject);

export interface BentoAuthContextProviderProps {
    children: React.ReactElement;
    value: BentoAuthContextObject;
}

export const BentoAuthContextProvider = ({ children, value }: BentoAuthContextProviderProps) => {
    return <BentoAuthContext.Provider value={value}>{children}</BentoAuthContext.Provider>;
};

export const useBentoAuthContext = () => {
    return useContext(BentoAuthContext);
};
