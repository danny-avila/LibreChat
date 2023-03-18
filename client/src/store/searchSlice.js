import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  search: false,
  query: '',
};

const currentSlice = createSlice({
  name: 'search',
  initialState,
  reducers: {
    setSearchState: (state, action) => {
      state.search = action.payload;
    },
    setQuery: (state, action) => {
      const q = action.payload;
      state.query = q;
      
      if (q === '') {
        state.search = false;
      } else if (q?.length > 0 && !state.search) {
        state.search = true;
      }
    },
  }
});

export const { setSearchState, setQuery } = currentSlice.actions;

export default currentSlice.reducer;
