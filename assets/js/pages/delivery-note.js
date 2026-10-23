const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const qtyFormat=value=>new Intl.NumberFormat("id-ID",{maximumFractionDigits:3}).format(Number(value)||0);
const dateFormat=value=>{if(!value)return "—";const date=new Date(String(value)+"T00:00:00");return Number.isNaN(date.getTime())?esc(value):new Intl.DateTimeFormat("id-ID",{dateStyle:"long"}).format(date)};

export function openDeliveryNote({brand,invoiceNumber,invoiceDate,noteNumber,recipientName,recipientAddress,recipientPhone,signerName,items}){
 const popup=window.open("","_blank");
 if(!popup){alert("Popup diblokir browser. Izinkan popup untuk membuka Surat Jalan PDF.");return}
 popup.opener=null;
 const safeItems=(items||[]).filter(item=>item&&String(item.name||"").trim()&&Number(item.qty)>0);
 if(!safeItems.length){popup.close();alert("Tidak ada barang dengan kuantitas yang valid.");return}
 const itemsPerPage=12;
 const pages=[];
 for(let start=0;start<safeItems.length;start+=itemsPerPage)pages.push(safeItems.slice(start,start+itemsPerPage));
 const logoUrl=new URL(brand.logo,window.location.href).href;
 const deliveryNumber="SJ-"+invoiceNumber;
 const totalQty=safeItems.reduce((sum,item)=>sum+(Number(item.qty)||0),0);
 const pageMarkup=(pageItems,pageIndex)=>{
  const rowStart=pageIndex*itemsPerPage;
  const rows=pageItems.map((item,index)=>"<tr><td class='sj-no'>"+(rowStart+index+1)+".</td><td class='sj-item'>"+esc(item.name)+"</td><td class='sj-qty'>"+esc(qtyFormat(item.qty))+"</td><td class='sj-unit'>"+esc(item.unit||"—")+"</td></tr>").join("");
  const pageQty=pageItems.reduce((sum,item)=>sum+(Number(item.qty)||0),0);
  const isLast=pageIndex===pages.length-1;
  return "<section class='sj-page'><header class='sj-brand'><img class='sj-logo' src='"+esc(logoUrl)+"' alt='Logo TB Nusantara'><div class='sj-brand-copy'><strong>"+esc(brand.company)+" | "+esc(brand.store)+"</strong><span>"+(brand.addressLines||[]).map(esc).join("<br>")+"</span><span>Telepon: "+esc(brand.phone)+" | WhatsApp: "+esc(brand.wa)+" | "+esc(brand.email)+" | "+esc(brand.site)+"</span></div></header>"+
   "<h1 class='sj-title'>SURAT JALAN</h1><section class='sj-info'><div class='sj-meta'><div><b>Tanggal</b><i>:</i><span>"+dateFormat(invoiceDate)+"</span></div><div><b>No. Surat Jalan</b><i>:</i><span>"+esc(deliveryNumber)+"</span></div><div><b>No. Invoice</b><i>:</i><span>"+esc(invoiceNumber)+"</span></div><div><b>No. Nota</b><i>:</i><span>"+esc(noteNumber||"—")+"</span></div></div><div class='sj-recipient'><b>Kepada Yth.</b><strong>"+esc(recipientName||"—")+"</strong><span>"+esc(recipientAddress||"—")+"</span><span>No. HP: "+esc(recipientPhone||"—")+"</span></div></section>"+
   "<table class='sj-table'><colgroup><col style='width:7%'><col style='width:65%'><col style='width:14%'><col style='width:14%'></colgroup><thead><tr><th>No.</th><th>Deskripsi Jasa / Produk</th><th>Qty</th><th>Satuan</th></tr></thead><tbody>"+rows+"</tbody></table>"+
   "<footer class='sj-footer'><div class='sj-page-summary'><span>Jumlah barang halaman ini: <b>"+esc(qtyFormat(pageQty))+"</b>"+(isLast?" <span class='sj-grand-total'>Total kuantitas surat jalan: <b>"+esc(qtyFormat(totalQty))+"</b></span>":"")+"</span><small>Halaman "+(pageIndex+1)+" dari "+pages.length+"</small></div>"+
   (isLast?"<div class='sj-signatures'><section><span>Pengirim</span><i></i><b>"+(signerName?esc(signerName):"Nama / tanda tangan")+"</b></section><section><span>Penerima</span><i></i><b>Nama / tanda tangan</b></section></div>":"")+"</footer></section>";
 };
 const style="<style>*{box-sizing:border-box}html,body{margin:0;min-height:100%;font-family:Arial,Helvetica,sans-serif;color:#17202a}.sj-toolbar{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:12px 18px;background:#f3f5f8;border-bottom:1px solid #d0d5dd;font:13px Arial,Helvetica,sans-serif}.sj-toolbar button{border:0;border-radius:7px;padding:9px 14px;background:#0b3f88;color:white;font-weight:700;cursor:pointer}.sj-document{padding:1px 0 20px;background:#e9edf2}.sj-sheet{width:210mm;height:297mm;margin:14px auto;background:#fff;display:flex;flex-direction:column;overflow:hidden;break-after:page;page-break-after:always}.sj-sheet:last-child{break-after:auto;page-break-after:auto}.sj-page{width:210mm;height:148.5mm;flex:0 0 148.5mm;padding:8mm 8mm 6mm;background:white;display:flex;flex-direction:column;overflow:hidden}.sj-page+.sj-page{border-top:1px dashed #98a2b3}.sj-page-empty{background:#fff}.sj-brand{display:grid;grid-template-columns:52px minmax(0,1fr);gap:9px;align-items:center;padding-bottom:3px;border-bottom:2px solid #0b3f88}.sj-logo{width:50px;height:50px;object-fit:contain}.sj-brand-copy{display:grid;gap:1px;min-width:0;font-size:8pt;line-height:1.2}.sj-brand-copy strong{font-size:9.2pt;color:#17202a}.sj-title{margin:4px 0;text-align:center;color:#0b3f88;font-size:14pt;line-height:1.05;letter-spacing:.04em}.sj-info{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start;font-size:8.2pt;line-height:1.25}.sj-meta{display:grid;gap:1px}.sj-meta>div{display:grid;grid-template-columns:82px 8px minmax(0,1fr);gap:3px}.sj-meta b{font-weight:700}.sj-meta i{text-align:center;font-style:normal}.sj-meta span,.sj-recipient span{overflow-wrap:anywhere}.sj-recipient{display:grid;gap:1px;padding-left:9px;border-left:1px solid #d0d5dd}.sj-recipient>b{color:#0b3f88}.sj-recipient>strong{font-size:8pt}.sj-table{width:100%;margin-top:5px;border-collapse:collapse;table-layout:fixed;font-size:8.8pt;line-height:1.15}.sj-table th{padding:3.5px 5px;border:1px solid #64748b;background:#eef3fa;color:#17202a;text-align:left;font-weight:700}.sj-table td{padding:3.5px 5px;border:1px solid #98a2b3;vertical-align:top}.sj-table tbody tr{break-inside:avoid;page-break-inside:avoid}.sj-no,.sj-qty{text-align:center;white-space:nowrap}.sj-unit{text-align:center;overflow-wrap:anywhere}.sj-item{overflow-wrap:anywhere}.sj-footer{margin-top:auto;padding-top:3px}.sj-page-summary{display:flex;justify-content:space-between;gap:8px;align-items:center;padding-top:3px;border-top:1px solid #98a2b3;font-size:7.5pt}.sj-grand-total{margin-left:8px}.sj-page-summary small{white-space:nowrap}.sj-signatures{display:grid;grid-template-columns:1fr 1fr;gap:45px;margin-top:5px;text-align:center;font-size:7.5pt}.sj-signatures section{display:grid;grid-template-rows:auto 22px auto;justify-items:center;gap:1px}.sj-signatures i{width:75%;border-bottom:1px solid #64748b}.sj-signatures b{font-size:7pt;font-weight:500}.sj-toolbar-spacer{flex:1}@page{size:A4 portrait;margin:0}@media print{html,body{width:210mm;height:auto;margin:0!important;background:white!important}.sj-toolbar{display:none!important}.sj-document{padding:0;background:white}.sj-sheet{width:210mm;height:297mm;margin:0;break-after:page;page-break-after:always}.sj-sheet:last-child{break-after:auto;page-break-after:auto}.sj-page{margin:0;width:210mm;height:148.5mm;flex:0 0 148.5mm;padding:8mm 8mm 6mm;box-shadow:none;overflow:hidden;-webkit-print-color-adjust:exact;print-color-adjust:exact}}@media screen{.sj-sheet{box-shadow:0 3px 16px #10182824}}@media screen and (max-width:920px){.sj-document{overflow-x:auto}.sj-sheet{margin-left:0;margin-right:0}}</style>";
 const toolbar="<div class='sj-toolbar'><strong>Surat Jalan · A4 portrait · 2 formulir per lembar</strong><span class='sj-toolbar-spacer'></span><button type='button' onclick='window.print()'>Cetak / Simpan PDF</button><button type='button' onclick='window.close()'>Tutup</button></div>";
 const pageBlocks=pages.map((page,index)=>pageMarkup(page,index));
 const sheets=[];
 for(let index=0;index<pageBlocks.length;index+=2){
  const top=pageBlocks[index];
  const bottom=pageBlocks[index+1]||"<section class='sj-page sj-page-empty' aria-hidden='true'></section>";
  sheets.push("<div class='sj-sheet'>"+top+bottom+"</div>");
 }
 const pagesHtml=sheets.join("");
 const html="<!doctype html><html lang='id'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>"+esc(deliveryNumber)+" - Surat Jalan</title>"+style+"</head><body>"+toolbar+"<main class='sj-document'>"+pagesHtml+"</main></body></html>";
 popup.document.open();
 popup.document.write(html);
 popup.document.close();
 popup.focus();
 const logo=popup.document.querySelector(".sj-logo");
 const startPrint=()=>popup.setTimeout(()=>popup.print(),250);
 if(logo&&logo.complete&&logo.naturalWidth>0)startPrint();
 else if(logo){logo.addEventListener("load",startPrint,{once:true});logo.addEventListener("error",startPrint,{once:true})}
 else startPrint();
}