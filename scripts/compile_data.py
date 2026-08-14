import os
import glob
import json
import re
from datetime import datetime, timedelta
import pandas as pd
import pdfplumber

def parse_time(time_str):
    if not time_str:
        return None
    time_str = time_str.strip().lower().replace(" ", "")
    for fmt in ("%I:%M%p", "%I%p", "%I:%M"):
        try:
            return datetime.strptime(time_str, fmt)
        except ValueError:
            continue
    return None

def parse_date_clean(d_val):
    if not d_val or pd.isna(d_val) or str(d_val).lower() == 'total':
        return None
    d_str = str(d_val).split(' ')[0].strip()
    for fmt in ('%m/%d/%Y', '%m/%d/%y', '%Y-%m-%d'):
        try:
            return datetime.strptime(d_str, fmt).strftime('%Y-%m-%d')
        except ValueError:
            continue
    return None

def extract_schedules_from_csv_excel(schedules_dir):
    """
    Parses CSV and Excel schedules in schedules_dir (e.g. Daily Overview CSV or schedule XLSX).
    Returns (schedule_lookup, valid_associates, min_date, max_date)
    """
    schedule_data = {}
    valid_associates = set()
    all_dates = set()

    if not os.path.exists(schedules_dir):
        return schedule_data, valid_associates, None, None

    schedule_files = glob.glob(os.path.join(schedules_dir, "*.csv")) + \
                     glob.glob(os.path.join(schedules_dir, "*.xlsx")) + \
                     glob.glob(os.path.join(schedules_dir, "*.xls"))

    for sched_path in schedule_files:
        try:
            if sched_path.endswith('.csv'):
                df = pd.read_csv(sched_path)
            else:
                df = pd.read_excel(sched_path)

            cols_map = {str(c).strip().lower(): c for c in df.columns}

            name_col = next((cols_map[k] for k in cols_map if 'associate name' in k or 'associate' in k or 'name' in k), None)
            date_col = next((cols_map[k] for k in cols_map if 'shift date' in k or 'date' in k), None)
            start_col = next((cols_map[k] for k in cols_map if 'start time' in k or 'start' in k), None)
            end_col = next((cols_map[k] for k in cols_map if 'end time' in k or 'end' in k), None)
            hours_col = next((cols_map[k] for k in cols_map if 'total hours' in k or 'shift hours' in k or 'hours' in k), None)

            if not name_col:
                continue

            for _, row in df.iterrows():
                assoc_name = row.get(name_col)
                if pd.isna(assoc_name) or not str(assoc_name).strip():
                    continue

                norm_name = str(assoc_name).strip().upper()
                valid_associates.add(norm_name)

                date_clean = parse_date_clean(row.get(date_col)) if date_col else None
                if date_clean:
                    all_dates.add(date_clean)

                st_str = str(row.get(start_col, '')).strip() if start_col and pd.notna(row.get(start_col)) else ''
                en_str = str(row.get(end_col, '')).strip() if end_col and pd.notna(row.get(end_col)) else ''
                
                shift_hours = 0.0
                if hours_col and pd.notna(row.get(hours_col)):
                    try:
                        shift_hours = float(row.get(hours_col))
                    except (ValueError, TypeError):
                        shift_hours = 0.0

                shift_str = f"{st_str} - {en_str}" if st_str and en_str else "Scheduled"

                info = {
                    "shift": shift_str,
                    "shiftHours": round(shift_hours, 2)
                }

                if date_clean:
                    schedule_data[(norm_name, date_clean)] = info
                schedule_data[norm_name] = info

        except Exception as e:
            print(f"Error parsing schedule file {sched_path}: {e}")

    sorted_dates = sorted(list(all_dates)) if all_dates else []
    min_date = sorted_dates[0] if sorted_dates else None
    max_date = sorted_dates[-1] if sorted_dates else None

    print(f"Extracted {len(valid_associates)} schedule associates across {len(schedule_files)} files.")
    print(f"Schedule date range: {min_date} to {max_date}")

    return schedule_data, valid_associates, min_date, max_date

def normalize_name(name):
    if not name or pd.isna(name):
        return ""
    return str(name).strip().upper()

def process_excel_files(workspace_dir, schedule_lookup, valid_associates, min_date, max_date):
    excel_files = glob.glob(os.path.join(workspace_dir, "By Associate View Wk *.xlsx"))
    def get_wk_num(filename):
        m = re.search(r'Wk\s*(\d+)', filename, re.IGNORECASE)
        return int(m.group(1)) if m else 0

    excel_files.sort(key=get_wk_num)
    all_records = []

    for filepath in excel_files:
        filename = os.path.basename(filepath)
        wk_num = get_wk_num(filename)

        try:
            df = pd.read_excel(filepath)
            current_associate = ""
            current_store = "1012"

            assoc_daily_shifts = {}

            for idx, row in df.iterrows():
                assoc_val = row.get('Associate')
                if pd.notna(assoc_val) and str(assoc_val).strip() != "":
                    current_associate = str(assoc_val).strip()

                norm_assoc = normalize_name(current_associate)
                # Strict associate filter: Associate MUST be present in schedules
                if norm_assoc not in valid_associates:
                    continue

                store_val = row.get('Store #')
                if pd.notna(store_val) and str(store_val) != "":
                    current_store = str(int(float(store_val)))

                day_val = str(row.get('Day of Pick Date', '')).strip()
                if not day_val or day_val == 'nan':
                    continue

                is_total = (day_val.lower() == 'total')
                date_clean = parse_date_clean(day_val)

                # Strict date filter: Must be within schedule date range (unless it's a Weekly Total)
                if not is_total and date_clean:
                    if min_date and date_clean < min_date:
                        continue
                    if max_date and date_clean > max_date:
                        continue

                ftpr = float(row.get('FTPR', 0)) if pd.notna(row.get('FTPR')) else 0.0
                ftp_exp = int(float(row.get('FTP Expected', 0))) if pd.notna(row.get('FTP Expected')) else 0
                ftp_act = int(float(row.get('FTP Actual', 0))) if pd.notna(row.get('FTP Actual')) else 0
                pick_rate = float(row.get('Pick Rate', 0)) if pd.notna(row.get('Pick Rate')) else 0.0
                pick_hours = float(row.get('Pick Hours', 0)) if pd.notna(row.get('Pick Hours')) else 0.0
                picked_req = int(float(row.get('Picked As Req Qty', 0))) if pd.notna(row.get('Picked As Req Qty')) else 0
                substitutions = int(float(row.get('Substitution Qty', 0))) if pd.notna(row.get('Substitution Qty')) else 0
                overrides = int(float(row.get('Ovrd Qty', 0))) if pd.notna(row.get('Ovrd Qty')) else 0
                nil_picks = int(float(row.get('Nil Pick Qty', 0))) if pd.notna(row.get('Nil Pick Qty')) else 0

                matched_sched = None
                if norm_assoc:
                    if date_clean and (norm_assoc, date_clean) in schedule_lookup:
                        matched_sched = schedule_lookup[(norm_assoc, date_clean)]
                    elif norm_assoc in schedule_lookup and not is_total:
                        matched_sched = schedule_lookup[norm_assoc]

                shift_hours = None
                shift_pph = None
                utilization = None
                non_pick_hours = None

                if matched_sched:
                    shift_hours = matched_sched['shiftHours']
                    if norm_assoc:
                        assoc_daily_shifts[norm_assoc] = assoc_daily_shifts.get(norm_assoc, 0.0) + shift_hours
                elif is_total and norm_assoc in assoc_daily_shifts:
                    shift_hours = assoc_daily_shifts[norm_assoc]

                if shift_hours and shift_hours > 0:
                    total_picked = picked_req + substitutions
                    shift_pph = round(total_picked / shift_hours, 2)
                    utilization = round((pick_hours / shift_hours) * 100.0, 1)
                    non_pick_hours = round(max(0.0, shift_hours - pick_hours), 2)

                record = {
                    "file": filename,
                    "week": wk_num,
                    "store": current_store,
                    "associate": current_associate,
                    "day": day_val,
                    "isTotal": is_total,
                    "ftpr": round(ftpr, 4),
                    "ftpExpected": ftp_exp,
                    "ftpActual": ftp_act,
                    "pickRate": round(pick_rate, 2),
                    "pickHours": round(pick_hours, 4),
                    "pickedAsReq": picked_req,
                    "substitutions": substitutions,
                    "overrides": overrides,
                    "nilPicks": nil_picks,
                    "shiftHours": shift_hours,
                    "shiftPPH": shift_pph,
                    "utilization": utilization,
                    "nonPickHours": non_pick_hours
                }
                all_records.append(record)

        except Exception as e:
            print(f"Error processing {filename}: {e}")

    # Remove any Weekly Total rows where no daily records were included in range
    final_records = [r for r in all_records if not r['isTotal'] or r.get('shiftHours') is not None]
    print(f"Processed {len(final_records)} records matching strict associate and date filters.")
    return final_records

def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    schedules_dir = os.path.join(base_dir, "schedules")
    output_json = os.path.join(base_dir, "src", "data", "initialData.json")

    print(f"Reading schedule CSV/Excel files from: {schedules_dir}")
    schedule_lookup, valid_associates, min_date, max_date = extract_schedules_from_csv_excel(schedules_dir)

    print(f"Processing Excel workbooks from: {base_dir}")
    records = process_excel_files(base_dir, schedule_lookup, valid_associates, min_date, max_date)

    print(f"Writing {len(records)} records to {output_json}...")
    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump(records, f, indent=2)

    print("Data compilation completed successfully!")

if __name__ == "__main__":
    main()
