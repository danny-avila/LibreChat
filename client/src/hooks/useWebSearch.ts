import { useState } from 'react';
import axios from 'axios';

export const useWebSearch = () => {
  const [isSearching, setIsSearching] = useState(false);

  const performWebSearch = async (query: string) => {
    try {
      setIsSearching(true);
      const response = await axios.post('/api/websearch', { query });
      return response.data;
    } catch (error) {
      console.error('Web search error:', error);
      throw error;
    } finally {
      setIsSearching(false);
    }
  };

  return {
    performWebSearch,
    isSearching,
  };
};

export default useWebSearch;
