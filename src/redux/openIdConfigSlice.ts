import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { AnyAction } from "redux";
import { ThunkAction } from 'redux-thunk';

import { RootState } from "./store";

type OpenIdConfigPayload = {
    issuer: string;
    authorization_endpoint: string;
    end_session_endpoint?: string;
    token_endpoint: string;
    grant_types_supported: string[];
}

// Async actions using createAsyncThunk
export const fetchOpenIdConfiguration = createAsyncThunk<OpenIdConfigPayload, string>(
    "openIdConfig/fetchOpenIdConfiguration",
    async (openIdConfigUrl: string, { rejectWithValue }) => {
        const response = await fetch(openIdConfigUrl);
        if (response.ok) {
            return await response.json();
        } else {
            return rejectWithValue("Could not fetch identity provider configuration");
        }
    },
    {
        condition: (_, { getState }) => {
            const state = getState() as RootState;
            const { isFetching, data, expiry } = state.openIdConfiguration;
            return !isFetching && (!data || !expiry || Date.now() > expiry * 1000);
        },
    }
);

export const fetchOpenIdConfigurationIfNecessary = (openIdConfigUrl: string):
    ThunkAction<void, RootState, unknown, AnyAction> =>
    async (dispatch, getState) => {
        const { isFetching, expiry } = getState().openIdConfiguration;
        if (isFetching || (expiry && Date.now() < expiry * 1000)) return;
        return dispatch(fetchOpenIdConfiguration(openIdConfigUrl));
    };

export type OIDCSliceState = {
    isFetching: boolean;
    hasAttempted: boolean;
    data?: OpenIdConfigPayload;
    expiry?: number;
};
const initialState: OIDCSliceState = {
    isFetching: false,
    hasAttempted: false,
    data: undefined,
    expiry: undefined,
};

export const openIdConfigSlice = createSlice({
    name: "openIdConfiguration",
    initialState,
    reducers: {},
    extraReducers: (builder) => {
        builder.addCase(fetchOpenIdConfiguration.pending, (state) => {
            state.isFetching = true;
        });
        builder.addCase(fetchOpenIdConfiguration.fulfilled, (state, { payload }) => {
            state.isFetching = false;
            state.hasAttempted = true;
            state.data = payload;
            state.expiry = Date.now() / 1000 + 3 * 60 * 60; // Cache for 3 hours
        });
        builder.addCase(fetchOpenIdConfiguration.rejected, (state, { error }) => {
            console.error(error);
            state.isFetching = false;
            state.hasAttempted = true;
            state.data = undefined;
            state.expiry = undefined;
        });
    },
});

export default openIdConfigSlice.reducer;
