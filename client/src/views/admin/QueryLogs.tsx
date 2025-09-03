// import React, { useState, useEffect } from 'react';

// import { useAdminLogs } from './useAdmin';
// import { SearchBar } from '~/views/admin/AdminSearchBar';
// import {Pagination} from '~/components/ui/Pagination';

// interface QueryLog {
//   user: { name: string; email: string } | { id: string };
//   model: string;
//   tokenCount: number;
//   createdAt: string;
// }

// const QueryLogs: React.FC = () => {
//   const { isAdmin, token } = useAdmin(); // Assuming useAdmin provides isAdmin and token
//   const [logs, setLogs] = useState<QueryLog[]>([]);
//   const [filteredLogs, setFilteredLogs] = useState<QueryLog[]>([]);
//   const [search, setSearch] = useState('');
//   const [page, setPage] = useState(1);
//   const limit = 10;

//   // Handle SSE connection
//   useEffect(() => {
//     if (!isAdmin || !token) return;

//     const eventSource = new EventSource('/api/queries', {
//       headers: {
//         Authorization: `Bearer ${token}`,
//       },
//     });

//     eventSource.onmessage = (event) => {
//       try {
//         const logData = JSON.parse(event.data);
//         setLogs((prevLogs) => {
//           const updatedLogs = [...prevLogs, logData];
//           setFilteredLogs(updatedLogs); // Update filtered logs initially
//           return updatedLogs;
//         });
//       } catch (error) {
//         console.error('Error parsing SSE data:', error);
//       }
//     };

//     eventSource.onerror = () => {
//       console.error('SSE connection error');
//       eventSource.close();
//     };

//     return () => {
//       eventSource.close();
//     };
//   }, [isAdmin, token]);

//   // Handle search filtering
//   const handleSearch = (searchTerm: string) => {
//     if (!searchTerm) {
//       setFilteredLogs(logs);
//       return;
//     }
//     const lowerSearch = searchTerm.toLowerCase();
//     const filtered = logs.filter(
//       (log) =>
//         ('name' in log.user && log.user.name.toLowerCase().includes(lowerSearch)) ||
//         ('email' in log.user && log.user.email.toLowerCase().includes(lowerSearch))
//     );
//     setFilteredLogs(filtered);
//     setPage(1); // Reset to first page on search
//   };

//   // Pagination logic
//   const indexOfLastLog = page * limit;
//   const indexOfFirstLog = indexOfLastLog - limit;
//   const currentLogs = filteredLogs.slice(indexOfFirstLog, indexOfLastLog);

//   if (!isAdmin) {
//     return <div className="text-red-500">Access denied. Admin privileges required.</div>;
//   }

//   return (
//     <div className="flex h-full flex-col gap-4 p-4">
//       <h2 className="text-xl font-semibold">Query Logs</h2>
//       <SearchBar
//         search={search}
//         setSearch={(value: string) => {
//           setSearch(value);
//           handleSearch(value);
//         }}
//         placeholder="Search by name or email"
//       />
//       <div className="flex-grow overflow-hidden">
//         <table className="min-w-full bg-white border border-gray-200">
//           <thead>
//             <tr className="bg-gray-100">
//               <th className="py-2 px-4 border-b text-left">User Name</th>
//               <th className="py-2 px-4 border-b text-left">Email</th>
//               <th className="py-2 px-4 border-b text-left">Model</th>
//               <th className="py-2 px-4 border-b text-left">Token Count</th>
//               <th className="py-2 px-4 border-b text-left">Created At</th>
//             </tr>
//           </thead>
//           <tbody>
//             {currentLogs.map((log, index) => (
//               <tr key={index} className="hover:bg-gray-50">
//                 <td className="py-2 px-4 border-b">
//                   {'name' in log.user ? log.user.name : 'Unknown'}
//                 </td>
//                 <td className="py-2 px-4 border-b">
//                   {'email' in log.user ? log.user.email : 'N/A'}
//                 </td>
//                 <td className="py-2 px-4 border-b">{log.model}</td>
//                 <td className="py-2 px-4 border-b">{log.tokenCount}</td>
//                 <td className="py-2 px-4 border-b">
//                   {new Date(log.createdAt).toLocaleString()}
//                 </td>
//               </tr>
//             ))}
//           </tbody>
//         </table>
//       </div>
//       {filteredLogs.length === 0 && (
//         <p className="text-center text-gray-500 mt-4">No logs found.</p>
//       )}
//       <Pagination
//         page={page}
//         limit={limit}
//         total={filteredLogs.length}
//         onPageChange={setPage}
//       />
//     </div>
//   );
// };

// export default QueryLogs;