import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import * as XLSX from '@e965/xlsx';
import ImportButton from '../../src/components/ImportButton.svelte';

const INV_HEADER = [
  'Material',
  'Biome / Location',
  'You Have',
  'Satchels',
  'Camp',
  'Trapper Clothes',
  'Trapper Saddles'
];

function xlsxFile(rows: unknown[][]): File {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Inventory Tracker');
  const written = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer | Uint8Array;
  const ab = written instanceof Uint8Array ? written.buffer : written;
  const file = new File([ab], 'tracker.xlsx');
  Object.defineProperty(file, 'arrayBuffer', { value: async () => ab });
  return file;
}

function badFile(): File {
  const file = new File(['nope'], 'tracker.xlsx');
  // Simulate an unreadable/corrupt upload: reading the bytes fails.
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => {
      throw new Error('unreadable');
    }
  });
  return file;
}

async function select(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await fireEvent.change(input, { target: { files: [file] } });
  return input;
}

describe('ImportButton', () => {
  it('renders a trigger and hidden file input', () => {
    render(ImportButton, { props: { onImport: vi.fn() } });
    expect(screen.getByRole('button', { name: /Import Excel/ })).toBeInTheDocument();
    // Clicking the button opens the (jsdom no-op) picker without error.
    fireEvent.click(screen.getByRole('button', { name: /Import Excel/ }));
  });

  it('parses an uploaded sheet and hands the merged progress to onImport', async () => {
    const onImport = vi.fn();
    render(ImportButton, { props: { onImport } });

    await select(
      xlsxFile([
        INV_HEADER,
        ['Alligator Skin', 'Swamps', 1, 0, 1, 0, 1],
        ['Deer Pelt', 'Forests', 7, 7, 0, 5, 0]
      ])
    );

    await waitFor(() => expect(onImport).toHaveBeenCalledOnce());
    const [delivered, summary] = onImport.mock.calls[0];
    expect(delivered.inventory['inventory-6']).toEqual({ camp: 1 });
    expect(summary.itemsImported).toBe(2);
    // Success message reflects the summary (plural, no unmatched).
    expect(await screen.findByRole('status')).toHaveTextContent(
      /Imported 2 items \(8 collected\)\./
    );
  });

  it('reports unmatched rows and uses singular wording for one item', async () => {
    const onImport = vi.fn();
    render(ImportButton, { props: { onImport } });

    await select(
      xlsxFile([
        INV_HEADER,
        ['Alligator Skin', 'Swamps', 1, 0, 1, 0, 1],
        ['Unicorn Horn', 'Nowhere', 3, 1, 0, 0, 0]
      ])
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      /Imported 1 item \(1 collected\) · 1 not recognised\./
    );
  });

  it('shows an error for a file that is not a valid spreadsheet', async () => {
    const onImport = vi.fn();
    render(ImportButton, { props: { onImport } });
    await select(badFile());
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't read that file/);
    expect(onImport).not.toHaveBeenCalled();
  });

  it('does nothing when no file is chosen', async () => {
    const onImport = vi.fn();
    render(ImportButton, { props: { onImport } });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await fireEvent.change(input, { target: { files: [] } });
    expect(onImport).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
