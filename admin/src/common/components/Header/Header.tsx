
function Header() {
  return (
    <header>
      <div className="border-bottom-1 flex items-center justify-between border-gray-500 p-4">
        <div className="flex items-center">
          <img src="/assets/LibreChatWideMargin.svg" alt="LibreChat Logo" className="mr-2 h-12 w-12" />
          <h1 className="text-2xl font-bold">LibreChat</h1>
        </div>
        <div className="flex items-center">
          <button className="mr-2 flex h-10 w-10 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-500">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 6h16M4 12h8m-8 6h16"
              />
            </svg>
          </button>
          <button className="flex h-10 w-10 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-500">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}

export default Header;
