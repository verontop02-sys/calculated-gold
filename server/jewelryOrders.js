function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    catalogId: row.catalog_id || null,
    title: row.title,
    assay: row.assay != null ? Number(row.assay) : null,
    weightG: row.weight_g != null ? Number(row.weight_g) : null,
    form: row.form || null,
    priceRub: Number(row.price_rub),
    status: row.status || 'stored',
    paymentId: row.payment_id || null,
    at: row.paid_at || row.created_at,
  };
}

export async function listJewelryOrders(supabase, clientId) {
  const { data, error } = await supabase
    .from('fintech_jewelry_orders')
    .select('id, catalog_id, title, assay, weight_g, form, price_rub, status, payment_id, paid_at, created_at')
    .eq('client_id', clientId)
    .order('paid_at', { ascending: false })
    .limit(80);
  if (error) {
    if (error.code === '42P01' || /does not exist/i.test(error.message || '')) return [];
    throw error;
  }
  return (data || []).map(mapRow).filter(Boolean);
}

export async function recordJewelryOrder(supabase, {
  clientId,
  catalogId,
  title,
  assay,
  weightG,
  form,
  priceRub,
  status = 'stored',
  paymentId,
  paidAt,
}) {
  const name = String(title || '').trim().slice(0, 160);
  const amount = Math.round(Number(priceRub) * 100) / 100;
  if (!clientId || !name || !Number.isFinite(amount) || amount <= 0) return null;

  const pid = String(paymentId || '').trim() || null;
  if (!pid) {
    const { data: existing } = await supabase
      .from('fintech_jewelry_orders')
      .select('id, catalog_id, title, assay, weight_g, form, price_rub, status, payment_id, paid_at, created_at')
      .eq('client_id', clientId)
      .eq('title', name)
      .eq('price_rub', amount)
      .is('payment_id', null)
      .limit(1)
      .maybeSingle();
    if (existing) return mapRow(existing);
  }
  const row = {
    client_id: clientId,
    catalog_id: catalogId ? String(catalogId).slice(0, 80) : null,
    title: name,
    assay: num(assay),
    weight_g: num(weightG),
    form: form ? String(form).slice(0, 40) : null,
    price_rub: amount,
    status: ['stored', 'ready', 'issued'].includes(status) ? status : 'stored',
    payment_id: pid,
    paid_at: paidAt || new Date().toISOString(),
  };

  const { data, error } = pid
    ? await supabase
      .from('fintech_jewelry_orders')
      .upsert(row, { onConflict: 'payment_id' })
      .select('id, catalog_id, title, assay, weight_g, form, price_rub, status, payment_id, paid_at, created_at')
      .maybeSingle()
    : await supabase
      .from('fintech_jewelry_orders')
      .insert(row)
      .select('id, catalog_id, title, assay, weight_g, form, price_rub, status, payment_id, paid_at, created_at')
      .maybeSingle();

  if (error) {
    if (error.code === '42P01' || /does not exist/i.test(error.message || '')) return null;
    if (error.code === '23505') {
      const { data: existing } = await supabase
        .from('fintech_jewelry_orders')
        .select('id, catalog_id, title, assay, weight_g, form, price_rub, status, payment_id, paid_at, created_at')
        .eq('client_id', clientId)
        .eq('payment_id', pid)
        .maybeSingle();
      return mapRow(existing);
    }
    throw error;
  }
  return mapRow(data);
}

export function jewelryFromYooMetadata(meta = {}) {
  const title = String(meta.jewelryTitle || '').trim();
  if (!title) return null;
  return {
    catalogId: String(meta.jewelryId || '').trim() || null,
    title,
    assay: num(meta.jewelryAssay),
    weightG: num(meta.jewelryWeight),
    form: String(meta.jewelryForm || '').trim() || null,
  };
}

export function jewelryMetadataForYoo(jewelry) {
  if (!jewelry?.title) return {};
  return {
    jewelryId: String(jewelry.id || jewelry.catalogId || '').slice(0, 64),
    jewelryTitle: String(jewelry.title).slice(0, 128),
    jewelryAssay: String(jewelry.assay ?? ''),
    jewelryWeight: String(jewelry.weightG ?? jewelry.weight_g ?? ''),
    jewelryForm: String(jewelry.form || '').slice(0, 32),
  };
}
