import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { AnyAction } from "redux";
import { ThunkAction } from 'redux-thunk';

import { RootState } from "./store";

type OpenIdConfigPayload = {
    issuer: string;
    authorization_endpoint: string;
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
        const { isFetching, data, expiry } = getState().openIdConfiguration;
        if (isFetching || data || (expiry && Date.now() < expiry * 1000)) return;
        return dispatch(fetchOpenIdConfiguration(openIdConfigUrl));
    };

type OIDCSliceState = {
    isFetching: boolean;
    data?: OpenIdConfigPayload;
    expiry?: number;
};
const initialState: OIDCSliceState = {
    isFetching: false,
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
            state.data = payload;
            state.expiry = Date.now() / 1000 + 3 * 60 * 60; // Cache for 3 hours
        });
        builder.addCase(fetchOpenIdConfiguration.rejected, (state, { error }) => {
            console.error(error);
            state.isFetching = false;
            state.data = undefined;
            state.expiry = undefined;
        });
    },
});

export default openIdConfigSlice.reducer;
