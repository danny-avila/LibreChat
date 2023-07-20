import { useGetLeaderboardQuery } from '@librechat/data-provider';
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react'; // the AG Grid React Component
import { Dialog } from '@headlessui/react';
import { X } from 'lucide-react';

import 'ag-grid-community/styles/ag-grid.css'; // Core grid CSS, always needed
import 'ag-grid-community/styles/ag-theme-alpine.css'; // Optional theme CSS
import GoldMedal from '../svg/GoldMedal';
import SilverMedal from '../svg/SilverMedal';
import BronzeMedal from '../svg/BronzeMedal';

function placeCellRenderer(place) {
  switch (place) {
    default: return place + 1

    case 0: return <GoldMedal />

    case 1: return <SilverMedal />

    case 2: return <BronzeMedal />
  }
}

function userCellRenderer(user) {
  const { name, username } = user;
  const icon =
      <img
        className="rounded-sm"
        style={{ width: 30, height: 30 }}
        src={`https://api.dicebear.com/6.x/initials/svg?seed=${name}&fontFamily=Verdana&fontSize=36`}
        alt="avatar"
      />
  return(<div className="relative flex items-center justify-left gap-2">
    {icon}
    {username}
  </div>);
}

export default function Leaderboard({ isOpen, setIsOpen }) {
  const getLeaderboardQuery = useGetLeaderboardQuery();

  const gridRef = useRef(); // Optional - for accessing Grid's API
  const [rowData, setRowData] = useState(); // Set rowData to Array of Objects, one Object per Row

  // Each Column Definition results in one Column.
  const [columnDefs, setColumnDefs] = useState([ // eslint-disable-line
    {
      field: '名次',
      cellRenderer: params => <div className="relative flex items-center justify-left">
        {placeCellRenderer(params.value)}
      </div>
    },
    {
      field: '用户',
      cellRenderer: params => userCellRenderer(params.value)
    },
    { field: '邀请人数' }
  ]);

  // DefaultColDef sets props common to all Columns
  const defaultColDef = useMemo( ()=> ({
    sortable: true
  }));

  // Example of consuming Grid Event
  const cellClickedListener = useCallback( event => {
    console.log('cellClicked', event);
  }, []);

  // Example using Grid's API
  const buttonListener = useCallback(() => {
    gridRef.current.api.deselectAll();
  }, []);

  useEffect(() => {
    if (getLeaderboardQuery.isSuccess) {
      let userList = [];
      for (let i = 0; i < getLeaderboardQuery.data.length; i++) {
        const name = getLeaderboardQuery.data[i].name;
        const username = getLeaderboardQuery.data[i].username;
        const numOfReferrals = getLeaderboardQuery.data[i].numOfReferrals;
        userList.push({
          '名次': i,
          '用户': { name, username },
          '邀请人数': numOfReferrals
        });
      }

      setRowData(userList);
    }
  }, [getLeaderboardQuery.isSuccess, getLeaderboardQuery.data]);

  return (
    <Dialog open={isOpen} onClose={() => setIsOpen(false)} className="relative z-50">
      {/* The backdrop, rendered as a fixed sibling to the panel container */}
      <div className="fixed inset-0 bg-gray-500/90 transition-opacity dark:bg-gray-800/90" />
      {/* Full-screen container to center the panel */}
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="relative w-full transform overflow-hidden overflow-y-auto rounded-lg bg-white text-left shadow-xl transition-all dark:bg-gray-900 max-sm:h-full sm:mx-7 sm:my-8 sm:max-w-2xl lg:max-w-5xl xl:max-w-7xl">
          <div className="flex items-center justify-between border-b-[1px] border-black/10 px-4 pb-4 pt-5 dark:border-white/10 sm:p-6">
            <div className="flex items-center">
              <div className="text-center sm:text-left">
                <Dialog.Title className="text-lg font-medium leading-6 text-gray-900 dark:text-gray-200">
                  邀请排行榜
                </Dialog.Title>
              </div>
            </div>
            <div>
              <div className="sm:mt-0">
                <button
                  onClick={() => setIsOpen(false)}
                  className="inline-block text-gray-500 hover:text-gray-100"
                  tabIndex={0}
                >
                  <X />
                </button>
              </div>
            </div>
          </div>
          <div className="p-4 sm:p-6 sm:pt-4">
            {/* Example using Grid's API */}
            <button onClick={buttonListener}>Push Me</button>
            {/* On div wrapping Grid a) specify theme CSS Class Class and b) sets Grid size */}
            <div className="ag-theme-alpine" style={{ width: 800, height: 500 }}>
              <AgGridReact
                ref={gridRef} // Ref for accessing Grid's API

                rowData={rowData} // Row Data for Rows

                columnDefs={columnDefs} // Column Defs for Columns
                defaultColDef={defaultColDef} // Default Column Properties

                animateRows={true} // Optional - set to 'true' to have rows animate when sorted
                rowSelection='multiple' // Options - allows click selection of rows

                onCellClicked={cellClickedListener} // Optional - registering for Grid Event
              />
            </div>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}