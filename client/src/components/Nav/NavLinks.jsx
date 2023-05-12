import SearchBar from './SearchBar';
import ClearConvos from './ClearConvos';
import DarkMode from './DarkMode';
import Logout from './Logout';
import ExportConversation from './ExportConversation';
import Settings from './Settings';

export default function NavLinks({ clearSearch, isSearchEnabled }) {
  return (
    <>
      {!!isSearchEnabled && (
        <SearchBar
          clearSearch={clearSearch}
        />
      )}
      <ExportConversation />
      <DarkMode />
      <ClearConvos />
			<Settings />
      <Logout />
    </>
  );
}
