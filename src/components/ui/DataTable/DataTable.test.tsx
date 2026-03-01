import { render, screen } from '@testing-library/react';
import DataTable from './DataTable';
import type { Column } from './DataTable';

interface TestItem {
  id: string;
  name: string;
}

const columns: Column<TestItem>[] = [{ key: 'name', header: 'Name', accessor: 'name' }];

describe('DataTable', () => {
  it('renders table with data', () => {
    const data: TestItem[] = [{ id: '1', name: 'Alice' }];
    render(<DataTable data={data} columns={columns} rowKey={(item) => item.id} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('renders header', () => {
    render(<DataTable data={[]} columns={columns} rowKey={(item) => item.id} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
  });

  it('shows empty message when no data', () => {
    render(
      <DataTable data={[]} columns={columns} rowKey={(item) => item.id} emptyMessage="No items" />
    );
    expect(screen.getByText('No items')).toBeInTheDocument();
  });

  it('suppresses empty message when loading', () => {
    render(<DataTable data={[]} columns={columns} rowKey={(item) => item.id} loading={true} />);
    expect(screen.queryByText('No data found.')).toBeNull();
  });
});
