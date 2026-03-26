import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { purchaseBook } from './bookPurchase';
import { supabase } from '@/utils/supabase';

// Mock Supabase RPC
mock.module('@/utils/supabase', () => {
  return {
    supabase: {
      rpc: mock(() => Promise.resolve({ data: null, error: null })),
    },
  };
});

describe('purchaseBook', () => {
  beforeEach(() => {
    mock.restore();
  });

  test('returns error when bookId or buyerId is missing or empty', async () => {
    expect(await purchaseBook('', 'buyer-1')).toEqual({ ok: false, message: 'İşlem tamamlanamadı.' });
    expect(await purchaseBook('book-1', '')).toEqual({ ok: false, message: 'İşlem tamamlanamadı.' });
    expect(await purchaseBook('  ', 'buyer-1')).toEqual({ ok: false, message: 'İşlem tamamlanamadı.' });
    expect(await purchaseBook('book-1', '  ')).toEqual({ ok: false, message: 'İşlem tamamlanamadı.' });
  });

  test('returns specific error when book is not for sale', async () => {
    (supabase.rpc as ReturnType<typeof mock>).mockResolvedValueOnce({
      data: null,
      error: { message: 'book_not_for_sale' },
    });
    const result = await purchaseBook('book-1', 'buyer-1');
    expect(result).toEqual({ ok: false, message: 'Bu kitap satılık değil veya satışı kapanmış.' });
  });

  test('returns specific error when user is not the seller', async () => {
    (supabase.rpc as ReturnType<typeof mock>).mockResolvedValueOnce({
      data: null,
      error: { message: 'only_seller_can_complete_sale' },
    });
    const result = await purchaseBook('book-1', 'buyer-1');
    expect(result).toEqual({ ok: false, message: 'Bu işlemi yalnızca satıcı tamamlayabilir.' });
  });

  test('returns specific error when trying to buy own book', async () => {
    (supabase.rpc as ReturnType<typeof mock>).mockResolvedValueOnce({
      data: null,
      error: { message: 'cannot_buy_own_book' },
    });
    const result = await purchaseBook('book-1', 'buyer-1');
    expect(result).toEqual({ ok: false, message: 'Kendi kitabınızı satın alamazsınız.' });
  });

  test('returns specific error when book is not found', async () => {
    (supabase.rpc as ReturnType<typeof mock>).mockResolvedValueOnce({
      data: null,
      error: { message: 'book_not_found' },
    });
    const result = await purchaseBook('book-1', 'buyer-1');
    expect(result).toEqual({ ok: false, message: 'Kitap bulunamadı.' });
  });

  test('returns generic error when error message is unknown', async () => {
    (supabase.rpc as ReturnType<typeof mock>).mockResolvedValueOnce({
      data: null,
      error: { message: 'some_unknown_error' },
    });
    const result = await purchaseBook('book-1', 'buyer-1');
    expect(result).toEqual({ ok: false, message: 'İşlem tamamlanamadı.' });
  });

  test('returns error when data is null', async () => {
    (supabase.rpc as ReturnType<typeof mock>).mockResolvedValueOnce({
      data: null,
      error: null,
    });
    const result = await purchaseBook('book-1', 'buyer-1');
    expect(result).toEqual({ ok: false, message: 'İşlem tamamlanamadı.' });
  });

  test('returns error when data is an empty string', async () => {
    (supabase.rpc as ReturnType<typeof mock>).mockResolvedValueOnce({
      data: '',
      error: null,
    });
    const result = await purchaseBook('book-1', 'buyer-1');
    expect(result).toEqual({ ok: false, message: 'İşlem tamamlanamadı.' });
  });

  test('returns success with newBookId when RPC succeeds', async () => {
    (supabase.rpc as ReturnType<typeof mock>).mockResolvedValueOnce({
      data: 'new-book-uuid-123',
      error: null,
    });
    const result = await purchaseBook('book-1', 'buyer-1');
    expect(result).toEqual({ ok: true, newBookId: 'new-book-uuid-123' });
  });
});
