/**
 * 수능최저 상담 보드 — 백엔드(즐겨찾기 + 우선순위 + 상담메모 + 학생데이터)
 * --------------------------------------------------------------
 *  배포: 확장프로그램 → Apps Script → 이 코드 붙여넣고 저장
 *       → 배포 → 배포 관리 → (기존 배포) 편집(연필) → 버전 '새 버전' → 배포
 *       (이렇게 하면 웹앱 URL이 그대로 유지됩니다)
 *
 *  - 즐겨찾기/우선순위 : gid 170899864 시트 (없으면 '즐겨찾기' 시트 생성)
 *  - 상담메모          : '상담메모' 시트
 *  - 학생 모의고사     : gid 835082359 ('전체') 시트를 JSONP로 제공
 */
var FAV_GID = 170899864;
var STUDENT_GID = 835082359;
var HEADER = ['timestamp','hak','name','classNum','no','recordNo','univ','region','type','typeName','major','criterion','minReq','order'];
var NHEADER = ['id','timestamp','hak','name','classNum','text','teacher'];
var OHEADER = ['timestamp','hak','recordNo','month','value','teacher']; // 판정 조정(확인→충족/미충족)

function doGet(e){
  var p = (e && e.parameter) || {};
  var cb = p.callback, out;
  try { out = handle(p); }
  catch (err) { out = { ok:false, error:String(err && err.message || err) }; }
  var body = JSON.stringify(out);
  if (cb) body = cb + '(' + body + ')';
  return ContentService.createTextOutput(body)
    .setMimeType(cb ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}
function doPost(e){ return doGet(e); }

function handle(p){
  var a = p.action || 'list';
  if (a === 'list')          return { ok:true, items: listFavs() };
  if (a === 'add')           return addFav(p);
  if (a === 'remove')        return removeFav(p);
  if (a === 'reorder')       return reorderFavs(p);
  if (a === 'notes_list')    return { ok:true, items: listNotes() };
  if (a === 'notes_add')     return addNote(p);
  if (a === 'notes_remove')  return removeNote(p);
  if (a === 'students')      return { ok:true, rows: listStudentsRows() };
  if (a === 'override_list') return { ok:true, items: listOverrides() };
  if (a === 'override_set')  return setOverride(p);
  return { ok:false, error:'unknown action: ' + a };
}

/* ===== 즐겨찾기 + 우선순위 ===== */
function getSheet(){
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sheets = ss.getSheets(), sh = null;
  for (var i=0;i<sheets.length;i++) if (sheets[i].getSheetId() === FAV_GID){ sh = sheets[i]; break; }
  if (!sh) sh = ss.getSheetByName('즐겨찾기') || ss.insertSheet('즐겨찾기');
  if (sh.getLastRow() === 0){ sh.getRange(1,1,1,HEADER.length).setValues([HEADER]); sh.setFrozenRows(1); }
  return sh;
}
function listFavs(){
  var sh = getSheet(), last = sh.getLastRow();
  if (last < 2) return [];
  var v = sh.getRange(2,1,last-1,HEADER.length).getValues(), out = [];
  for (var i=0;i<v.length;i++){
    if (!v[i][1] && !v[i][5]) continue;
    var o = {};
    for (var j=0;j<HEADER.length;j++) o[HEADER[j]] = v[i][j];
    o.hak = String(o.hak); o.recordNo = String(o.recordNo);
    out.push(o);
  }
  return out;
}
function addFav(p){
  var lock = LockService.getScriptLock(); lock.waitLock(8000);
  try {
    var sh = getSheet(), hak = String(p.hak||''), recordNo = String(p.recordNo||'');
    if (!hak || !recordNo) return { ok:false, error:'hak/recordNo required' };
    if (findRow(sh, hak, recordNo) > 0) return { ok:true, dup:true };
    var row = { timestamp:new Date(), hak:hak, name:p.name||'', classNum:p.classNum||'',
      no:p.no||'', recordNo:recordNo, univ:p.univ||'', region:p.region||'', type:p.type||'',
      typeName:p.typeName||'', major:p.major||'', criterion:p.criterion||'', minReq:p.minReq||'',
      order: Date.now() };
    sh.appendRow(HEADER.map(function(k){ return row[k]; }));
    return { ok:true };
  } finally { lock.releaseLock(); }
}
function removeFav(p){
  var lock = LockService.getScriptLock(); lock.waitLock(8000);
  try {
    var sh = getSheet(), r = findRow(sh, String(p.hak||''), String(p.recordNo||''));
    if (r > 0) sh.deleteRow(r);
    return { ok:true, removed:r>0 };
  } finally { lock.releaseLock(); }
}
function reorderFavs(p){
  var lock = LockService.getScriptLock(); lock.waitLock(8000);
  try {
    var sh = getSheet(), hak = String(p.hak||''), nos = String(p.nos||'').split(',').filter(String);
    if (!hak || !nos.length) return { ok:false, error:'hak/nos required' };
    var last = sh.getLastRow(); if (last < 2) return { ok:true };
    var orderCol = HEADER.indexOf('order') + 1;
    var v = sh.getRange(2,1,last-1,HEADER.length).getValues();
    for (var i=0;i<v.length;i++){
      if (String(v[i][1]) === hak){
        var idx = nos.indexOf(String(v[i][5]));
        if (idx >= 0) sh.getRange(i+2, orderCol).setValue(idx);
      }
    }
    return { ok:true };
  } finally { lock.releaseLock(); }
}
function findRow(sh, hak, recordNo){
  var last = sh.getLastRow(); if (last < 2) return -1;
  var v = sh.getRange(2,1,last-1,HEADER.length).getValues();
  for (var i=0;i<v.length;i++) if (String(v[i][1])===hak && String(v[i][5])===recordNo) return i+2;
  return -1;
}

/* ===== 상담 메모 ===== */
function getNotesSheet(){
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('상담메모') || ss.insertSheet('상담메모');
  if (sh.getLastRow() === 0){ sh.getRange(1,1,1,NHEADER.length).setValues([NHEADER]); sh.setFrozenRows(1); }
  return sh;
}
function listNotes(){
  var sh = getNotesSheet(), last = sh.getLastRow();
  if (last < 2) return [];
  var v = sh.getRange(2,1,last-1,NHEADER.length).getValues(), out = [];
  for (var i=0;i<v.length;i++){
    if (!v[i][0] && !v[i][2]) continue;
    var o = {};
    for (var j=0;j<NHEADER.length;j++) o[NHEADER[j]] = v[i][j];
    o.id = String(o.id); o.hak = String(o.hak);
    out.push(o);
  }
  return out;
}
function addNote(p){
  var lock = LockService.getScriptLock(); lock.waitLock(8000);
  try {
    var sh = getNotesSheet(), hak = String(p.hak||''), text = String(p.text||'');
    if (!hak || !text) return { ok:false, error:'hak/text required' };
    var id = String(p.id || Date.now());
    sh.appendRow([id, new Date(), hak, p.name||'', p.classNum||'', text, p.teacher||'']);
    return { ok:true, id:id };
  } finally { lock.releaseLock(); }
}
function removeNote(p){
  var lock = LockService.getScriptLock(); lock.waitLock(8000);
  try {
    var sh = getNotesSheet(), id = String(p.id||''), last = sh.getLastRow();
    if (last >= 2 && id){
      var ids = sh.getRange(2,1,last-1,1).getValues();
      for (var i=0;i<ids.length;i++) if (String(ids[i][0])===id){ sh.deleteRow(i+2); return { ok:true, removed:true }; }
    }
    return { ok:true, removed:false };
  } finally { lock.releaseLock(); }
}

/* ===== 판정 조정(확인 → 충족/미충족, 모든 담임 공유) ===== */
function getOverrideSheet(){
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('판정조정') || ss.insertSheet('판정조정');
  if (sh.getLastRow() === 0){ sh.getRange(1,1,1,OHEADER.length).setValues([OHEADER]); sh.setFrozenRows(1); }
  return sh;
}
function listOverrides(){
  var sh = getOverrideSheet(), last = sh.getLastRow();
  if (last < 2) return [];
  var v = sh.getRange(2,1,last-1,OHEADER.length).getValues(), out = [];
  for (var i=0;i<v.length;i++){
    if (!v[i][1]) continue;
    out.push({ hak:String(v[i][1]), recordNo:String(v[i][2]), month:String(v[i][3]), value:String(v[i][4]) });
  }
  return out;
}
function findOverrideRow(sh, hak, recordNo, month){
  var last = sh.getLastRow(); if (last < 2) return -1;
  var v = sh.getRange(2,1,last-1,OHEADER.length).getValues();
  for (var i=0;i<v.length;i++)
    if (String(v[i][1])===hak && String(v[i][2])===recordNo && String(v[i][3])===month) return i+2;
  return -1;
}
function setOverride(p){
  var lock = LockService.getScriptLock(); lock.waitLock(8000);
  try {
    var sh = getOverrideSheet();
    var hak = String(p.hak||''), recordNo = String(p.recordNo||''), month = String(p.month||''), value = String(p.value||'');
    if (!hak || !recordNo || !month) return { ok:false, error:'hak/recordNo/month required' };
    var r = findOverrideRow(sh, hak, recordNo, month);
    if (!value){ // 확인으로 되돌리기 → 행 삭제
      if (r > 0) sh.deleteRow(r);
      return { ok:true, removed:r>0 };
    }
    if (r > 0){ sh.getRange(r,1,1,OHEADER.length).setValues([[new Date(),hak,recordNo,month,value,p.teacher||'']]); }
    else { sh.appendRow([new Date(),hak,recordNo,month,value,p.teacher||'']); }
    return { ok:true };
  } finally { lock.releaseLock(); }
}

/* ===== 학생 모의고사 데이터(JSONP) ===== */
function listStudentsRows(){
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sheets = ss.getSheets(), sh = null;
  for (var i=0;i<sheets.length;i++) if (sheets[i].getSheetId() === STUDENT_GID){ sh = sheets[i]; break; }
  if (!sh) sh = ss.getSheetByName('전체');
  if (!sh) return [];
  var v = sh.getDataRange().getValues(), out = [];
  for (var r=0;r<v.length;r++){
    var line = [];
    for (var c=0;c<v[r].length;c++){ var x = v[r][c]; line.push(x===null||x===undefined?'':String(x)); }
    out.push(line);
  }
  return out;
}
