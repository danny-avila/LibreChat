import React, { useState, useEffect } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { useGetAllUsers, TUser } from 'librechat-data-provider';
import styles from './styles.module.css';

function Users() {
  const [users, setUsers] = useState<TUser[]>([]);

  const { data, isLoading, isError, error } = useGetAllUsers();

  const columns = [
    { field: 'username', header: 'Username', sortable: false, className: styles.usernameColumn },
    { field: 'name', header: 'Name', sortable: false, className: styles.nameColumn },
    { field: 'email', header: 'Email', sortable: false, className: styles.emailColumn },
    { field: 'role', header: 'Role', sortable: false, className: styles.roleColumn },
    { field: 'provider', header: 'Provider', sortable: false, className: styles.providerColumn },
    { field: 'createdAt', header: 'Created', sortable: false, className: styles.createdColumn },
    { field: 'updatedAt', header: 'Updated', sortable: false, className: styles.updatedColumn },
    { field: 'plugins', header: 'Plugins', sortable: false, className: styles.pluginsColumn },
  ];

  useEffect(() => {
    if (data) {
      data.forEach((user) => {
        user.createdAt = user.createdAt.split('T')[0];
        user.updatedAt = user.updatedAt.split('T')[0];
      });
      setUsers(data);
    }
  }, [data]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (isError) {
    return <div>Error: {error.message}</div>;
  }

  return (
    <div className="card">
      <DataTable value={users} tableStyle={{ minWidth: '50rem' }} resizableColumns>
        {columns.map((col, i) => (
          <Column
            key={col.field}
            field={col.field}
            header={col.header}
            className={col.className}
            body={col.body}
          />
        ))}
      </DataTable>
    </div>
  );
}

export default Users;
