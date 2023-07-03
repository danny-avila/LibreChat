type TMobileNavProps = {
  navVisible: boolean;
  setNavVisible: (navVisible: boolean) => void;
};

function MobileNav({ navVisible, setNavVisible }: TMobileNavProps) {
  return (
    <div className="flex items-center justify-between border-b-2 border-gray-300 bg-white px-4 py-1 dark:bg-gray-800 md:hidden">
      <div className="flex items-center">
        <button
          className="text-gray-500 focus:text-gray-600 focus:outline-none dark:text-gray-300"
          aria-label="toggle menu"
          onClick={() => setNavVisible(!navVisible)}
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z"
            ></path>
          </svg>
        </button>
      </div>
      <div className="flex items-center">
        <button
          className="flex-shrink-0 text-gray-500 focus:text-gray-600 focus:outline-none dark:text-gray-300"
          aria-label="toggle theme"
        >
          <svg
            className="h-6 w-6 fill-current"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="12" cy="12" r="5"></circle>
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M12 2a10 10 0 100 20 10 10 0 000-20zM2 12a10 10 0 1120 0 10 10 0 01-20 0z"
            ></path>
          </svg>
        </button>
      </div>
    </div>
  );
}

export default MobileNav;
