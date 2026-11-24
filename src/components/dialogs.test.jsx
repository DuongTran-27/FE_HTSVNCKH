import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { ConfirmDialog } from './ui.jsx';
import { ReasonDialog } from './ReasonDialog.jsx';
import { ConflictDialog } from '../pages/topics/TopicEditPage.jsx';

// Radix gắn bộ nghe "bấm ra ngoài" sau một nhịp
const clickOutside = async () => { await new Promise((r) => setTimeout(r, 0)); fireEvent.pointerDown(document.body); };

afterEach(cleanup);

function Host({ reason }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Mở</button>
      {open && (reason
        ? <ReasonDialog title="Từ chối" confirmLabel="Gửi" onSubmit={vi.fn()} onCancel={() => setOpen(false)} />
        : <ConfirmDialog title="Xóa?" message="Chắc chưa" onConfirm={vi.fn()} onCancel={() => setOpen(false)} />)}
    </>
  );
}

// Phím gửi vào phần tử đang focus như trình duyệt thật (FocusScope của Radix nghe keydown trên hộp, không ở document)
describe('hộp thoại truy cập được', () => {
  it('ReasonDialog: focus vào ô lý do, Tab/Shift+Tab xoay vòng, Esc đóng và trả focus', async () => {
    render(<Host reason />);
    const opener = screen.getByText('Mở');
    opener.focus();
    fireEvent.click(opener);
    const area = screen.getByLabelText('Lý do');
    expect(document.activeElement).toBe(area);
    fireEvent.keyDown(document.activeElement, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByText('Gửi'));
    fireEvent.keyDown(document.activeElement, { key: 'Tab' });
    expect(document.activeElement).toBe(area);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('ConfirmDialog: focus vào Hủy, Esc đóng và trả focus', async () => {
    render(<Host />);
    const opener = screen.getByText('Mở');
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement).toBe(screen.getByText('Hủy'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('ReasonDialog: bấm ra ngoài không đóng; đã gõ lý do thì Esc không đóng', async () => {
    render(<Host reason />);
    fireEvent.click(screen.getByText('Mở'));
    await clickOutside();
    expect(screen.getByRole('dialog', { name: 'Từ chối' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'Chưa đạt yêu cầu' } });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByText('Hủy'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('ConflictDialog: Esc và bấm ra ngoài không đóng, chỉ hai nút quyết định', async () => {
    const onTakeNew = vi.fn();
    const onKeepMine = vi.fn();
    render(<ConflictDialog onTakeNew={onTakeNew} onKeepMine={onKeepMine} />);
    const dlg = screen.getByRole('dialog', { name: 'Hồ sơ vừa được thành viên khác cập nhật' });
    expect(document.activeElement).toBe(screen.getByText('Tải bản mới (bỏ thay đổi của tôi)'));
    fireEvent.keyDown(document, { key: 'Escape' });
    await clickOutside();
    expect(dlg.isConnected).toBe(true);
    expect(onTakeNew).not.toHaveBeenCalled();
    expect(onKeepMine).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Giữ nội dung của tôi'));
    expect(onKeepMine).toHaveBeenCalledOnce();
  });
});
