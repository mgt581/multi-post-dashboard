export function csv(rows) {
  const columns = Object.keys(rows[0] || {});
  const escape = value => {
    let text = value == null ? '' : String(value);
    if (/^[\s]*[=+@-]/.test(text)) text = "'"+text;
    return '"'+text.replaceAll('"','""')+'"';
  };
  return '\ufeff'+[columns.map(escape).join(','),...rows.map(row=>columns.map(c=>escape(row[c])).join(','))].join('\r\n');
}
