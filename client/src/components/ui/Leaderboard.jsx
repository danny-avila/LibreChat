import { useGetLeaderboardQuery } from '@librechat/data-provider';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react'; // the AG Grid React Component

import 'ag-grid-community/styles/ag-grid.css'; // Core grid CSS, always needed
import 'ag-grid-community/styles/ag-theme-alpine.css'; // Optional theme CSS
import GoldMedal from '../svg/GoldMedal';
import SilverMedal from '../svg/SilverMedal';
import BronzeMedal from '../svg/BronzeMedal';
import useDocumentTitle from '~/hooks/useDocumentTitle';
import { localize } from '~/localization/Translation';
import { useRecoilValue } from 'recoil';
import store from '~/store';

/*
Adapted from Stack Overflow
URL: https://stackoverflow.com/a/1038781
Author: Travis (https://stackoverflow.com/users/307338/travis)
Last edited: Jul 31, 2017 at 20:40
*/
function getWidth() {
  return Math.max(
    document.body.scrollWidth,
    document.documentElement.scrollWidth,
    document.body.offsetWidth,
    document.documentElement.offsetWidth,
    document.documentElement.clientWidth
  );
}

function placeCellRenderer(place) {
  switch (place) {
    default: return place + 1

    case 0: return(
      <div className="relative flex items-center justify-left">
        <GoldMedal />
      </div>
    );

    case 1: return(
      <div className="relative flex items-center justify-left">
        <SilverMedal />
      </div>
    );

    case 2: return(
      <div className="relative flex items-center justify-left">
        <BronzeMedal />
      </div>
    );
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

export default function Leaderboard() {
  const lang = useRecoilValue(store.lang);
  const getLeaderboardQuery = useGetLeaderboardQuery();
  const initColWidth = getWidth();

  const gridRef = useRef();
  const [rowData, setRowData] = useState(); // Set rowData to Array of Objects, one Object per Row

  // Each Column Definition results in one Column.
  const [columnDefs, setColumnDefs] = useState([ // eslint-disable-line
    {
      field: '名次',
      cellRenderer: params => placeCellRenderer(params.value),
      minWidth: 70,
      width: initColWidth * 2 / 10,
    },
    {
      field: '用户',
      cellRenderer: params => userCellRenderer(params.value),
      minWidth: 160,
      width: initColWidth * 4.8 / 10,
    },
    {
      field: '邀请人数',
      minWidth: 100,
      width: initColWidth * 3 / 10,
    }
  ]);

  // DefaultColDef sets props common to all Columns
  const defaultColDef = useMemo(() => ({
    maxWidth: 200,
    sortable: true,
    suppressMovable: true,
    resizable: true
  }));

  useDocumentTitle(localize(lang, 'com_ui_leaderboard'));

  useEffect(() => {
    function updateSize() {
      const colWidth = getWidth();
      const newColDefs = [
        {
          field: '名次',
          cellRenderer: params => placeCellRenderer(params.value),
          minWidth: 70,
          width: colWidth * 2 / 10
        },
        {
          field: '用户',
          cellRenderer: params => userCellRenderer(params.value),
          minWidth: 180,
          width: colWidth * 4.8 / 10
        },
        {
          field: '邀请人数',
          minWidth: 100,
          width: colWidth * 3 / 10
        }
      ];

      setColumnDefs(newColDefs);
    }

    window.addEventListener('resize', updateSize);

    return () => window.removeEventListener('resize', updateSize);
  }, [document.body.scrollWidth,
    document.documentElement.scrollWidth,
    document.body.offsetWidth,
    document.documentElement.offsetWidth,
    document.documentElement.clientWidth]);

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
    <div className="flex h-full flex-col items-center overflow-y-auto pt-0 text-sm dark:bg-gray-800">
      <h1
        id="landing-title"
        className="mb-5 ml-auto mr-auto mt-3 flex items-center justify-center gap-2 text-center text-4xl font-semibold dark:text-gray-200 sm:mb-8 md:mt-[5vh]"
      >
        邀请排行榜
      </h1>
      <div className='flex justify-center' style={{ width: '100%', height: '100%' }}>
        {/* On div wrapping Grid a) specify theme CSS Class Class and b) sets Grid size */}
        <div className="ag-theme-alpine" style={{ width: 605, height: 500 }}>
          <AgGridReact
            ref={gridRef}
            rowData={rowData} // Row Data for Rows

            columnDefs={columnDefs} // Column Defs for Columns
            defaultColDef={defaultColDef} // Default Column Properties

            animateRows={true} // Optional - set to 'true' to have rows animate when sorted
          />
        </div>
      </div>
    </div>
  );
}