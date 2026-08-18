/**
 * Supabase Client & Cloud Data Layer
 * Associate Performance 2.0 - Walmart Store #1012
 */

export const SUPABASE_URL = "https://papwoytxbwwcljdfqiav.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_AJslsC3XOFCSZPjP5QulTA_NSLT6atA";

let supabase = null;

export function getSupabase() {
  if (!supabase && window.supabase) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabase;
}

/**
 * Fetches all associate performance records from Supabase database.
 */
export async function fetchPerformanceFromSupabase() {
  try {
    const client = getSupabase();
    let allRows = [];
    const PAGE_SIZE = 1000;
    let from = 0;
    let hasMore = true;

    if (client) {
      while (hasMore) {
        const { data, error } = await client
          .from('associate_performance')
          .select('*')
          .order('id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);

        if (error) {
          console.warn('Supabase fetch error, using local fallback:', error);
          return null;
        }

        if (data && data.length > 0) {
          allRows = allRows.concat(data);
          if (data.length < PAGE_SIZE) {
            hasMore = false;
          } else {
            from += PAGE_SIZE;
          }
        } else {
          hasMore = false;
        }
      }
      return allRows.map(mapDbRowToAppRow);
    }
    
    // Direct REST API fallback with range headers
    while (hasMore) {
      const to = from + PAGE_SIZE - 1;
      const res = await fetch(`${SUPABASE_URL}/rest/v1/associate_performance?select=*&order=id.asc`, {
        headers: {
          "apikey": SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
          "Range-Unit": "items",
          "Range": `${from}-${to}`
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data && data.length > 0) {
        allRows = allRows.concat(data);
        if (data.length < PAGE_SIZE) {
          hasMore = false;
        } else {
          from += PAGE_SIZE;
        }
      } else {
        hasMore = false;
      }
    }
    return allRows.map(mapDbRowToAppRow);
  } catch (err) {
    console.warn('Could not fetch from Supabase, falling back to local file:', err);
    return null;
  }
}

/**
 * Saves a 1-on-1 coaching note to Supabase.
 */
export async function saveCoachingNoteToSupabase({ associateName, startDate, endDate, notesText }) {
  try {
    const client = getSupabase();
    const payload = {
      associate_name: associateName,
      start_date: startDate || '',
      end_date: endDate || '',
      notes_text: notesText,
      updated_at: new Date().toISOString()
    };

    if (client) {
      const { data, error } = await client
        .from('coaching_notes')
        .upsert(payload, { onConflict: 'associate_name,start_date,end_date' });
      if (error) throw error;
      return true;
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/coaching_notes`, {
      method: 'POST',
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
      },
      body: JSON.stringify(payload)
    });
    return res.ok;
  } catch (err) {
    console.warn('Error saving note to Supabase:', err);
    return false;
  }
}

export async function fetchCoachingNoteFromSupabase({ associateName, startDate, endDate }) {
  try {
    const client = getSupabase();
    if (client) {
      const { data, error } = await client
        .from('coaching_notes')
        .select('notes_text')
        .eq('associate_name', associateName)
        .eq('start_date', startDate || '')
        .eq('end_date', endDate || '')
        .maybeSingle();

      if (error || !data) return null;
      return data.notes_text;
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/coaching_notes?associate_name=eq.${encodeURIComponent(associateName)}&start_date=eq.${encodeURIComponent(startDate || '')}&end_date=eq.${encodeURIComponent(endDate || '')}&select=notes_text`, {
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.length > 0 ? json[0].notes_text : null;
  } catch (err) {
    console.warn('Error fetching note from Supabase:', err);
    return null;
  }
}

export async function fetchAllCoachingNotesForAssociate({ associateName }) {
  try {
    const client = getSupabase();
    if (client) {
      const { data, error } = await client
        .from('coaching_notes')
        .select('*')
        .eq('associate_name', associateName)
        .order('updated_at', { ascending: false });

      if (error || !data) return [];
      return data;
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/coaching_notes?associate_name=eq.${encodeURIComponent(associateName)}&order=updated_at.desc`, {
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    if (!res.ok) return [];
    const json = await res.json();
    return json || [];
  } catch (err) {
    console.warn('Error fetching all associate notes from Supabase:', err);
    return [];
  }
}

export async function deleteCoachingNoteFromSupabase({ id, associateName, startDate, endDate, notesText }) {
  try {
    const client = getSupabase();
    if (client) {
      let query = client.from('coaching_notes').delete();
      if (id && !String(id).includes('_')) {
        query = query.eq('id', id);
      } else if (associateName) {
        query = query.eq('associate_name', associateName);
        if (notesText) query = query.eq('notes_text', notesText);
      }
      const { error } = await query;
      if (error) throw error;
      return true;
    }

    let url = `${SUPABASE_URL}/rest/v1/coaching_notes?`;
    if (id && !String(id).includes('_')) {
      url += `id=eq.${id}`;
    } else if (associateName) {
      url += `associate_name=eq.${encodeURIComponent(associateName)}`;
      if (notesText) url += `&notes_text=eq.${encodeURIComponent(notesText)}`;
    }

    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    return res.ok;
  } catch (err) {
    console.warn('Error deleting note from Supabase:', err);
    return false;
  }
}

/**
 * Inserts or upserts performance records into Supabase in chunks.
 */
export async function insertPerformanceBatchToSupabase(records) {
  try {
    const formatted = records.map(r => ({
      store: r.store || '1012',
      week: parseInt(r.week, 10) || 0,
      associate: r.associate || '',
      day: r.day || '',
      iso_date: r.iso_date || null,
      is_total: Boolean(r.isTotal),
      ftpr: parseFloat(r.ftpr || 0),
      ftp_expected: parseInt(r.ftpExpected || 0),
      ftp_actual: parseInt(r.ftpActual || 0),
      pick_rate: parseFloat(r.pickRate || 0),
      pick_hours: parseFloat(r.pickHours || 0),
      picked_as_req: parseInt(r.pickedAsReq || 0),
      substitutions: parseInt(r.substitutions || 0),
      overrides: parseInt(r.overrides || 0),
      nil_picks: parseInt(r.nilPicks || 0),
      shift_hours: parseFloat(r.shiftHours || 0),
      shift_pph: parseFloat(r.shiftPPH || 0),
      utilization: parseFloat(r.utilization || 0),
      non_pick_hours: parseFloat(r.nonPickHours || 0)
    }));

    const client = getSupabase();
    const CHUNK_SIZE = 250;

    for (let i = 0; i < formatted.length; i += CHUNK_SIZE) {
      const chunk = formatted.slice(i, i + CHUNK_SIZE);
      if (client) {
        const { error } = await client.from('associate_performance').insert(chunk);
        if (error) throw error;
      } else {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/associate_performance`, {
          method: 'POST',
          headers: {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
          },
          body: JSON.stringify(chunk)
        });
        if (!res.ok) throw new Error(`Supabase batch error: ${res.statusText}`);
      }
    }
    return true;
  } catch (err) {
    console.error('Error inserting records to Supabase:', err);
    return false;
  }
}

function mapDbRowToAppRow(dbRow) {
  return {
    id: dbRow.id,
    store: dbRow.store,
    week: dbRow.week,
    associate: dbRow.associate,
    day: dbRow.day,
    iso_date: dbRow.iso_date,
    isTotal: dbRow.is_total,
    ftpr: parseFloat(dbRow.ftpr || 0),
    ftpExpected: parseInt(dbRow.ftp_expected || 0),
    ftpActual: parseInt(dbRow.ftp_actual || 0),
    pickRate: parseFloat(dbRow.pick_rate || 0),
    pickHours: parseFloat(dbRow.pick_hours || 0),
    pickedAsReq: parseInt(dbRow.picked_as_req || 0),
    substitutions: parseInt(dbRow.substitutions || 0),
    overrides: parseInt(dbRow.overrides || 0),
    nilPicks: parseInt(dbRow.nil_picks || 0),
    shiftHours: parseFloat(dbRow.shift_hours || 0),
    shiftPPH: parseFloat(dbRow.shift_pph || 0),
    utilization: parseFloat(dbRow.utilization || 0),
    nonPickHours: parseFloat(dbRow.non_pick_hours || 0)
  };
}
