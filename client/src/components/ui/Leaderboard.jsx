import { useGetLeaderboardQuery } from "~/data-provider";
import React, { useState, useRef, useEffect, useMemo, useCallback} from 'react';
import { AgGridReact } from 'ag-grid-react'; // the AG Grid React Component

import 'ag-grid-community/styles/ag-grid.css'; // Core grid CSS, always needed
import 'ag-grid-community/styles/ag-theme-alpine.css'; // Optional theme CSS

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
  const getLeaderboardQuery = useGetLeaderboardQuery();
  
  const gridRef = useRef(); // Optional - for accessing Grid's API
  const [rowData, setRowData] = useState(); // Set rowData to Array of Objects, one Object per Row

  // Each Column Definition results in one Column.
  const columnDefs = useState([
    {field: '名次'},
    {
      field: '用户',
      cellRenderer: params => userCellRenderer(params.value)
    },
    {field: '邀请人数'}
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
    <div>

      {/* Example using Grid's API */}
      <button onClick={buttonListener}>Push Me</button>

      {/* On div wrapping Grid a) specify theme CSS Class Class and b) sets Grid size */}
      <div className="ag-theme-alpine" style={{width: 800, height: 500}}>

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
  );
}