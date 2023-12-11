import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { RootState } from "./store";

// Async actions using createAsyncThunk
export const fetchOpenIdConfiguration = createAsyncThunk(
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

type OIDCSliceState = {
    isFetching: boolean;
    data: any;
    expiry: number | null;
};
const initialState: OIDCSliceState = {
    isFetching: false,
    data: null,
    expiry: null,
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
            state.data = null;
            state.expiry = null;
        });
    },
});

export const {} = openIdConfigSlice.actions;
export default openIdConfigSlice.reducer;
