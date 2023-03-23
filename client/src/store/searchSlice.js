import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  searchEnabled: false,
  search: false,
  query: '',
  inputValue: '',
};

const currentSlice = createSlice({
  name: 'search',
  initialState,
  reducers: {
    setInputValue: (state, action) => {
      state.inputValue = action.payload;
    },
    setSearchState: (state, action) => {
      state.searchEnabled = action.payload;
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

export const { setInputValue, setSearchState, setQuery } = currentSlice.actions;

export default currentSlice.reducer;
