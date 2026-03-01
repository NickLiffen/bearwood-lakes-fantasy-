// Reusable data table component with sorting support

import { ReactNode } from 'react';
import './DataTable.css';

export type SortDirection = 'asc' | 'desc';

export interface Column<T> {
  /** Unique key for the column */
  key: string;
  /** Header text */
  header: string | ReactNode;
  /** Whether column is sortable */
  sortable?: boolean;
  /** Column width (CSS value) */
  width?: string;
  /** Text alignment */
  align?: 'left' | 'center' | 'right';
  /** Custom render function for cell content */
  render?: (item: T, index: number) => ReactNode;
  /** If no render function, use this key to access data */
  accessor?: keyof T;
  /** Additional class name for header */
  headerClassName?: string;
  /** Additional class name for cells */
  cellClassName?: string;
}

interface DataTableProps<T> {
  /** Array of data items to display */
  data: T[];
  /** Column definitions */
  columns: Column<T>[];
  /** Unique key accessor for each row */
  rowKey: (item: T) => string;
  /** Current sort column key */
  sortColumn?: string;
  /** Current sort direction */
  sortDirection?: SortDirection;
  /** Handler for sort column click */
  onSort?: (column: string) => void;
  /** Message to show when no data */
  emptyMessage?: string;
  /** Whether data is still loading - if true and data is empty, suppress empty message */
  loading?: boolean;
  /** Function to get additional class names for a row */
  rowClassName?: (item: T) => string;
  /** Handler for row click */
  onRowClick?: (item: T) => void;
  /** Additional class name for the table */
  className?: string;
}

function DataTable<T>({
  data,
  columns,
  rowKey,
  sortColumn,
  sortDirection,
  onSort,
  emptyMessage = 'No data found.',
  loading = false,
  rowClassName,
  onRowClick,
  className = '',
}: DataTableProps<T>) {
  const renderSortArrow = (columnKey: string) => {
    if (sortColumn !== columnKey) {
      return <span className="dt-sort-arrows">↕</span>;
    }
    return (
      <span className="dt-sort-arrow dt-sort-active">{sortDirection === 'asc' ? '↑' : '↓'}</span>
    );
  };

  const handleHeaderClick = (column: Column<T>) => {
    if (column.sortable && onSort) {
      onSort(column.key);
    }
  };

  const getCellContent = (item: T, column: Column<T>, index: number): ReactNode => {
    if (column.render) {
      return column.render(item, index);
    }
    if (column.accessor) {
      const value = item[column.accessor];
      return value as ReactNode;
    }
    return null;
  };

  return (
    <div className="dt-container">
      <table className={`dt-table ${className}`}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={`
                  dt-th
                  ${column.sortable ? 'dt-th-sortable' : ''}
                  ${column.align ? `dt-align-${column.align}` : ''}
                  ${column.headerClassName || ''}
                `}
                style={column.width ? { width: column.width } : undefined}
                onClick={() => handleHeaderClick(column)}
              >
                <span className="dt-th-content">
                  {column.header}
                  {column.sortable && renderSortArrow(column.key)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            loading ? null : (
              <tr>
                <td colSpan={columns.length} className="dt-empty">
                  {emptyMessage}
                </td>
              </tr>
            )
          ) : (
            data.map((item, index) => (
              <tr
                key={rowKey(item)}
                className={`dt-row ${rowClassName ? rowClassName(item) : ''} ${onRowClick ? 'dt-row-clickable' : ''}`}
                onClick={onRowClick ? () => onRowClick(item) : undefined}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`
                      dt-td
                      ${column.align ? `dt-align-${column.align}` : ''}
                      ${column.cellClassName || ''}
                    `}
                  >
                    {getCellContent(item, column, index)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;
