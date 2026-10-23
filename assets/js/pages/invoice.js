import { openDeliveryNote } from "./delivery-note.js?v=20261023-surat-jalan-a4-two-up-v2";
const BRAND={company:"CV NUSANTARA BUILDING MATERIAL",store:"TB NUSANTARA",addressLines:["Jalan Lintas Selatan, Dk. Gudang RT 001/RW 001,","Ds. Surorejan, Kec. Puring, Kab. Kebumen, Jawa Tengah 54383"],phone:"0823-4250-9336",wa:"0812-3456-3843",email:"cvnbmgroup@gmail.com",site:"tbnusantara.com",logo:"assets/img/cvnbm-stempel-hd.png"};
const BANK={bank:"Bank Jateng",name:"NUSANTARA BUILDING MATERIAL",number:"1100001507"};
const INVOICE_GAS_URL="https://script.google.com/macros/s/AKfycbyaUscsruoi7X_uWF1P1-CIbZ27QFsSajqeFDHwcCAK578WJ32MI30Uujxtj9FYnqFf/exec";

async function invoiceApiRequest(url,options={}){
 const response=await fetch(url,{cache:"no-store",...options});
 const text=await response.text();
 let data;
 try{data=JSON.parse(text)}catch(error){throw new Error("Respons GAS Invoice bukan JSON valid.")}
 if(!response.ok||data.success===false)throw new Error(data.message||"Permintaan GAS Invoice gagal.");
 return data.data!==undefined?data.data:data;
}
function invoiceApiGet(action,params={}){
 const query=new URLSearchParams({action,...params});
 return invoiceApiRequest(INVOICE_GAS_URL+"?"+query.toString());
}
function invoiceApiPost(action,payload={}){
 return invoiceApiRequest(INVOICE_GAS_URL,{
  method:"POST",
  headers:{"Content-Type":"text/plain;charset=utf-8"},
  body:JSON.stringify({action,...payload})
 });
}
let lineId=0;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function num(v){let s=String(v??"").trim().replace(/[^0-9,.-]/g,"");if(s.includes(","))s=s.replace(/\./g,"").replace(",",".");else if(/^-?\d{1,3}(\.\d{3})+$/.test(s))s=s.replace(/\./g,"");const n=Number(s);return Number.isFinite(n)?n:0}
const money=n=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Math.round(n||0));
const qtyFmt=n=>new Intl.NumberFormat("id-ID",{maximumFractionDigits:3}).format(n||0);
const today=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)};
function invNo(){const d=new Date(),p=n=>String(n).padStart(2,"0");return "INV-"+d.getFullYear()+p(d.getMonth()+1)+p(d.getDate())+"-"+p(d.getHours())+p(d.getMinutes())+p(d.getSeconds())}
const newLine=()=>({id:++lineId,name:"",qty:"1",unit:"pcs",price:""});
function calc(lines,pphOn){const items=lines.map(x=>({id:x.id,name:x.name,unit:x.unit,qty:Math.max(0,num(x.qty)),price:Math.max(0,num(x.price))})).map(x=>({...x,amount:Math.round(x.qty*x.price)})).filter(x=>x.name.trim()||x.price>0);const gross=items.reduce((s,x)=>s+x.amount,0),dpp=Math.round(gross/1.11),ppn=gross-dpp,pph=pphOn?Math.round(dpp*.015):0;return{items,gross,dpp,ppn,pph,qty:items.reduce((s,x)=>s+x.qty,0),pay:gross-ppn-pph}}
function field(label,id,value,type="text",extra=""){return '<label class="invoice-field"><span>'+label+'</span><input id="'+id+'" type="'+type+'" value="'+esc(value)+'" '+extra+'></label>'}
export function renderInvoicePage(){
 const root=document.querySelector("#page-content");if(!root)return;
 let lines=[newLine(),newLine()];
 root.innerHTML=`
 <section class="page-heading invoice-heading"><div><p class="eyebrow">Dokumen penjualan</p><h2>Invoice</h2><p class="page-description">Buat invoice, periksa hitungannya, lalu simpan sebagai PDF.</p></div><div class="invoice-actions"><button class="btn btn-light" id="inv-save" type="button">Simpan Draft</button><button class="btn btn-light" id="inv-open" type="button">Buka Draft</button><button class="btn btn-light" id="inv-reset" type="button">Invoice baru</button><button class="btn btn-primary" id="inv-print-top" type="button">Cetak / Simpan PDF</button><button class="btn btn-light" id="inv-delivery-top" type="button">Surat Jalan PDF</button></div></section>
 <div class="invoice-layout"><section class="invoice-editor" aria-label="Form invoice">
 <div class="invoice-card"><h3>01 · Informasi invoice</h3><p>Identitas dokumen dan penerima.</p><div class="invoice-fields">
 ${field("Tanggal dibuat","inv-date",today(),"date","required")}${field("No. Invoice","inv-number",invNo(),"text","required")}${field("No. Nota","inv-note","")}${field("No. HP penerima","inv-phone","","tel")}${field("Kepada Yth.","inv-to","","text","required")}<label class="invoice-field"><span>Alamat penerima</span><textarea id="inv-address" rows="3"></textarea></label></div></div>
 <div class="invoice-card"><h3>02 · Rincian barang</h3><p>Harga satuan yang diinput sudah termasuk PPN.</p><div id="inv-lines"></div><button class="invoice-add" id="inv-add" type="button">＋ Tambah barang</button>
 <div class="invoice-pph"><div><strong>Potongan PPh</strong><small>Aktifkan untuk transaksi instansi yang dikenai pemungutan PPh 1,5%.</small></div><label class="invoice-toggle"><input id="inv-pph" type="checkbox"><span></span><b>PPh 1,5%</b></label></div></div>
 <div class="invoice-card"><h3>03 · Informasi pembayaran</h3><p>Rekening tujuan dan penutup invoice.</p><div class="invoice-fields">
 ${field("Bank","inv-bank",BANK.bank)}${field("Nama rekening","inv-bank-name",BANK.name)}${field("Nomor rekening","inv-bank-number",BANK.number)}${field("Nama penanda tangan","inv-signer","")}</div></div>
 </section>
 <section class="invoice-preview"><div class="invoice-preview-bar"><span>● Pratinjau langsung</span><span id="inv-storage-status" class="invoice-storage-status" role="status" aria-live="polite">Menghubungkan ke penyimpanan...</span><button class="btn btn-primary" id="inv-print" type="button">Cetak / Simpan PDF</button></div><article class="invoice-paper" id="inv-paper"></article><p class="invoice-help">Simpan PDF terlebih dahulu, lalu lampirkan saat mengirim melalui WhatsApp.</p><button class="invoice-wa" id="inv-wa" type="button">Bagikan teks invoice via WhatsApp</button></section></div>
 <dialog class="invoice-drafts-dialog" id="inv-drafts-dialog" aria-labelledby="inv-drafts-title"><div class="invoice-drafts-shell"><header class="invoice-drafts-header"><div><h2 id="inv-drafts-title">Draft Invoice</h2><p>Pilih invoice untuk membuka dan mengedit.</p></div><button type="button" class="invoice-drafts-close" id="inv-drafts-close" aria-label="Tutup">×</button></header><label class="invoice-drafts-search"><span>Cari invoice</span><input id="inv-drafts-search" type="search" placeholder="Nomor invoice, nota, nama penerima, atau telepon"></label><div class="invoice-drafts-list" id="inv-drafts-list" role="list" aria-label="Daftar invoice"></div></div></dialog>`;
 const host=root.querySelector("#inv-lines"),paper=root.querySelector("#inv-paper"),val=id=>root.querySelector("#"+id)?.value?.trim()||"";
 let currentInvoiceId="";
 const storageStatus=root.querySelector("#inv-storage-status");
 const storageReady=invoiceApiGet("health").then(health=>{
  if(!health||health.status!=="ok"||health.storageReady!==true)throw new Error("Spreadsheet Invoice belum siap.");
  if(storageStatus)storageStatus.textContent="Penyimpanan invoice siap";
  return true;
 }).catch(error=>{
  console.error("[Invoice API] health check gagal:",error);
  if(storageStatus)storageStatus.textContent="GAS belum terhubung. Periksa endpoint dan izin akses.";
  return false;
 });
 async function storageRequest(action,payload={}){
  if(!await storageReady)throw new Error("Koneksi GAS Invoice belum siap.");
  if(action==="saveInvoice")return invoiceApiPost(action,payload);
  if(action==="getInvoice"||action==="listInvoices")return invoiceApiGet(action,payload);
  throw new Error("Aksi Invoice tidak dikenal.");
 }
 function renderRows(){host.innerHTML=lines.map((x,n)=>'<div class="invoice-row" data-id="'+x.id+'"><span class="invoice-row-no">'+(n+1)+'</span><label>Nama barang<input data-key="name" value="'+esc(x.name)+'" placeholder="Nama item"></label><label>Qty<input data-key="qty" inputmode="decimal" value="'+esc(x.qty)+'"></label><label>Satuan<input data-key="unit" value="'+esc(x.unit)+'"></label><label>Harga incl. pajak<input data-key="price" inputmode="decimal" value="'+esc(x.price)+'" placeholder="0"></label><strong class="invoice-row-total">'+money(num(x.qty)*num(x.price))+'</strong><button type="button" data-del="'+x.id+'" aria-label="Hapus barang">×</button></div>').join("");paint()}
 function paint(){
  const t=calc(lines,root.querySelector("#inv-pph").checked),date=val("inv-date"),dateText=date?new Intl.DateTimeFormat("id-ID",{dateStyle:"long"}).format(new Date(date+"T00:00:00")):"—";
  const rows=t.items.length?t.items.map((x,n)=>'<tr><td>'+ (n+1)+'.</td><td>'+esc(x.name||"—")+'</td><td class="num">'+qtyFmt(x.qty)+'</td><td>'+esc(x.unit||"—")+'</td><td class="num">'+money(x.price)+'</td><td class="num">'+money(x.amount)+'</td></tr>').join(""):'<tr><td colspan="6" class="empty">Rincian barang tampil di sini.</td></tr>';
  paper.innerHTML='<header class="invoice-brand"><img src="'+BRAND.logo+'" alt="Logo TB Nusantara"><div><strong>'+BRAND.company+' | '+BRAND.store+'</strong><span class="invoice-brand-address">'+BRAND.addressLines.join("<br>")+'</span><span class="invoice-brand-contact">Telepon: '+BRAND.phone+' | WhatsApp: '+BRAND.wa+' | '+BRAND.email+' | '+BRAND.site+'</span></div></header>'+
  '<h1 class="invoice-doc-title">INVOICE</h1>'+
  '<section class="invoice-parties"><div class="invoice-meta"><div class="invoice-meta-row"><b>Tanggal</b><span>:</span><span>'+esc(dateText)+'</span></div><div class="invoice-meta-row"><b>No. Invoice</b><span>:</span><span>'+esc(val("inv-number")||"—")+'</span></div><div class="invoice-meta-row"><b>No. Nota</b><span>:</span><span>'+esc(val("inv-note")||"—")+'</span></div></div><div class="invoice-recipient"><small>Kepada Yth.</small><strong>'+esc(val("inv-to")||"Nama penerima")+'</strong><span>'+esc(val("inv-address")||"Alamat penerima")+'</span><span>No. HP: '+esc(val("inv-phone")||"—")+'</span></div></section>'+
  '<table class="invoice-table"><colgroup><col style="width:5%"><col style="width:41%"><col style="width:9%"><col style="width:10%"><col style="width:16%"><col style="width:19%"></colgroup><thead><tr><th>No.</th><th>Deskripsi Jasa / Produk</th><th>Qty</th><th>Satuan</th><th>Harga Satuan</th><th>Jumlah</th></tr></thead><tbody>'+rows+'</tbody></table>'+
  '<section class="invoice-totals"><div class="invoice-total-summary"><div class="invoice-total-qty"><span>Total kuantitas barang</span><b>'+qtyFmt(t.qty)+'</b></div><div class="invoice-payment"><strong>Metode Pembayaran</strong><div class="invoice-payment-row"><span>Transfer Bank</span><span>:</span><b>'+esc(val("inv-bank")||"—")+'</b></div><div class="invoice-payment-row"><span>No. Rekening</span><span>:</span><b>'+esc(val("inv-bank-number")||"—")+'</b></div><div class="invoice-payment-row"><span>Atas Nama</span><span>:</span><b>'+esc(val("inv-bank-name")||"—")+'</b></div></div></div><div class="invoice-total-lines"><div><span>Subtotal barang (harga termasuk PPN)</span><b>'+money(t.gross)+'</b></div><div class="muted"><span>DPP (informasi perhitungan)</span><b>'+money(t.dpp)+'</b></div><div class="deduct"><span>Potongan PPN efektif 11%</span><b>− '+money(t.ppn)+'</b></div>'+(root.querySelector("#inv-pph").checked?'<div class="deduct"><span>Potongan PPh 1,5% dari DPP</span><b>− '+money(t.pph)+'</b></div>':"")+'<div class="payable"><span>Jumlah Yang Harus Dibayar</span><b>'+money(t.pay)+'</b></div></div></section>'+
  '<footer class="invoice-footer"><div class="invoice-sign"><section><span>Hormat kami,</span><i></i>'+(val("inv-signer")&&val("inv-signer").toLowerCase()!=="tb nusantara"?'<b class="invoice-signer-name">'+esc(val("inv-signer"))+'</b>':"")+'</section><section class="invoice-receipt-sign"><span>Tanda terima,</span><i></i></section></div></footer>';
  host.querySelectorAll(".invoice-row").forEach(row=>{const x=lines.find(z=>z.id===Number(row.dataset.id));row.querySelector(".invoice-row-total").textContent=money(num(x.qty)*num(x.price))});
 }
 host.addEventListener("input",e=>{const row=e.target.closest(".invoice-row"),key=e.target.dataset.key;if(!row||!key)return;const x=lines.find(z=>z.id===Number(row.dataset.id));if(x){x[key]=e.target.value;paint()}});
 host.addEventListener("click",e=>{const b=e.target.closest("[data-del]");if(!b)return;lines=lines.filter(x=>x.id!==Number(b.dataset.del));if(!lines.length)lines.push(newLine());renderRows()});
 root.querySelector("#inv-add").addEventListener("click",()=>{lines.push(newLine());renderRows();host.querySelector(".invoice-row:last-child input")?.focus()});
 ["inv-date","inv-number","inv-note","inv-phone","inv-to","inv-address","inv-bank","inv-bank-name","inv-bank-number","inv-signer"].forEach(id=>root.querySelector("#"+id).addEventListener("input",paint));
 root.querySelector("#inv-pph").addEventListener("change",paint);
 function printInvoice(){const to=root.querySelector("#inv-to"),no=root.querySelector("#inv-number"),date=root.querySelector("#inv-date");for(const input of [date,no,to]){if(!input.checkValidity()){input.reportValidity();return}}if(!lines.some(x=>x.name.trim()&&num(x.qty)>0&&num(x.price)>0)){alert("Tambahkan minimal satu barang dengan nama, kuantitas, dan harga yang valid.");return}window.print()}
 root.querySelector("#inv-print").addEventListener("click",printInvoice);root.querySelector("#inv-print-top").addEventListener("click",printInvoice);
 function printDeliveryNote(){
  const dateInput=root.querySelector("#inv-date"),numberInput=root.querySelector("#inv-number"),recipientInput=root.querySelector("#inv-to");
  for(const input of [dateInput,numberInput,recipientInput]){if(!input.checkValidity()){input.reportValidity();return}}
  const entered=lines.filter(item=>item.name.trim());
  if(!entered.length){alert("Tambahkan minimal satu deskripsi barang untuk surat jalan.");return}
  if(entered.some(item=>num(item.qty)<=0)){alert("Pastikan kuantitas setiap barang lebih dari nol.");return}
  openDeliveryNote({
   brand:BRAND,
   invoiceNumber:val("inv-number"),
   invoiceDate:val("inv-date"),
   noteNumber:val("inv-note"),
   recipientName:val("inv-to"),
   recipientAddress:val("inv-address"),
   recipientPhone:val("inv-phone"),
   signerName:val("inv-signer"),
   items:entered.map(item=>({name:item.name.trim(),qty:num(item.qty),unit:item.unit.trim()||"—"}))
  });
 }
 root.querySelector("#inv-delivery-top").addEventListener("click",printDeliveryNote);
 root.querySelector("#inv-wa").addEventListener("click",()=>{const t=calc(lines,root.querySelector("#inv-pph").checked),message=["Invoice "+val("inv-number"),"Kepada: "+val("inv-to"),"No. Nota: "+val("inv-note"),"Total barang: "+qtyFmt(t.qty),"Jumlah yang harus dibayar: "+money(t.pay),"TB Nusantara","Silakan lampirkan PDF invoice yang telah disimpan."].filter(Boolean).join("\n");window.open("https://wa.me/?text="+encodeURIComponent(message),"_blank","noopener,noreferrer")});
 root.querySelector("#inv-reset").addEventListener("click",()=>{if(confirm("Mulai invoice baru? Isian saat ini akan dihapus."))renderInvoicePage()});
 async function saveDraft(){
  const requiredIds=["inv-date","inv-number","inv-to"];
  for(const id of requiredIds){const input=root.querySelector("#"+id);if(!input.checkValidity()){input.reportValidity();return}}
  const entered=lines.filter(item=>item.name.trim()||String(item.price).trim());
  if(!entered.length||entered.some(item=>!item.name.trim()||num(item.qty)<=0||num(item.price)<=0)){
   alert("Lengkapi nama, qty, dan harga pada setiap baris barang yang diisi.");return;
  }
  const payload={
   invoiceId:currentInvoiceId,
   invoiceNumber:val("inv-number"),
   invoiceDate:val("inv-date"),
   noteNumber:val("inv-note"),
   recipientName:val("inv-to"),
   recipientAddress:val("inv-address"),
   recipientPhone:val("inv-phone"),
   items:entered.map(item=>({name:item.name.trim(),qty:num(item.qty),unit:item.unit.trim(),price:num(item.price)})),
   pphEnabled:root.querySelector("#inv-pph").checked,
   bank:val("inv-bank"),
   accountName:val("inv-bank-name"),
   accountNumber:val("inv-bank-number"),
   signerName:val("inv-signer")
  };
  const button=root.querySelector("#inv-save");button.disabled=true;
  if(storageStatus)storageStatus.textContent="Menyimpan draft...";
  try{
   const result=await storageRequest("saveInvoice",payload);
   currentInvoiceId=result.invoiceId;
   button.textContent="Perbarui Draft";
   if(storageStatus)storageStatus.textContent="Draft "+result.invoiceNumber+" tersimpan";
  }catch(error){if(storageStatus)storageStatus.textContent="Gagal menyimpan draft";alert(error.message)}
  finally{button.disabled=false}
 }
 function loadInvoice(invoice){
  currentInvoiceId=invoice.invoiceId;
  [["inv-date",invoice.invoiceDate],["inv-number",invoice.invoiceNumber],["inv-note",invoice.noteNumber],["inv-phone",invoice.recipientPhone],["inv-to",invoice.recipientName],["inv-address",invoice.recipientAddress],["inv-bank",invoice.bank],["inv-bank-name",invoice.accountName],["inv-bank-number",invoice.accountNumber],["inv-signer",invoice.signerName]].forEach(([id,value])=>{root.querySelector("#"+id).value=value||""});
  root.querySelector("#inv-pph").checked=invoice.pphEnabled===true;
  lines=(invoice.items||[]).map(item=>({id:++lineId,name:item.name||"",qty:String(item.qty??1),unit:item.unit||"pcs",price:String(item.price??"")}));
  if(!lines.length)lines.push(newLine());
  root.querySelector("#inv-save").textContent="Perbarui Draft";
  renderRows();
  if(storageStatus)storageStatus.textContent="Draft "+invoice.invoiceNumber+" dibuka";
 }
 const draftsDialog=root.querySelector("#inv-drafts-dialog"),draftsList=root.querySelector("#inv-drafts-list"),draftsSearch=root.querySelector("#inv-drafts-search");
 let draftResults=[],searchTimer=null,searchSequence=0;
 function renderDraftList(){
  if(!draftResults.length){draftsList.innerHTML='<p class="invoice-drafts-empty">Belum ada draft yang cocok.</p>';return}
  draftsList.innerHTML=draftResults.map((item,index)=>'<button type="button" class="invoice-draft-card" data-draft-index="'+index+'"><span class="invoice-draft-main"><strong>'+esc(item.invoiceNumber||"Invoice tanpa nomor")+'</strong><span>'+esc(item.recipientName||"Tanpa nama penerima")+'</span><small>'+esc(item.noteNumber||"Tanpa nomor nota")+' · '+esc(item.invoiceDate||item.updatedAt||"")+'</small></span><b>'+money(item.totalPayable)+'</b><em>Buka &amp; Edit</em></button>').join("");
 }
 async function loadSelectedDraft(item,button){
  button.disabled=true;
  button.classList.add("is-loading");
  try{
   const invoice=await storageRequest("getInvoice",{invoiceId:item.invoiceId});
   if(!invoice)throw new Error("Detail invoice tidak ditemukan.");
   loadInvoice(invoice);
   draftsDialog.close();
   root.querySelector(".invoice-editor")?.scrollIntoView({behavior:"smooth",block:"start"});
   root.querySelector("#inv-number").focus({preventScroll:true});
  }catch(error){alert(error.message||"Gagal membuka draft invoice.")}
  finally{button.disabled=false;button.classList.remove("is-loading")}
 }
 async function loadDraftList(query=""){
  const sequence=++searchSequence;
  draftsList.innerHTML='<p class="invoice-drafts-empty">Memuat daftar invoice...</p>';
  try{
   const results=await storageRequest("listInvoices",{searchText:query,limit:50});
   if(sequence!==searchSequence)return;
   draftResults=Array.isArray(results)?results:[];
   renderDraftList();
  }catch(error){
   if(sequence!==searchSequence)return;
   draftResults=[];
   draftsList.innerHTML='<p class="invoice-drafts-error">'+esc(error.message||"Gagal memuat daftar invoice.")+'</p>';
  }
 }
 async function openDraft(){
  draftsSearch.value="";
  draftsDialog.showModal();
  await loadDraftList("");
  draftsSearch.focus();
 }
 draftsList.addEventListener("click",event=>{const button=event.target.closest("[data-draft-index]");if(button){const item=draftResults[Number(button.dataset.draftIndex)];if(item)loadSelectedDraft(item,button)}});
 draftsSearch.addEventListener("input",()=>{window.clearTimeout(searchTimer);searchTimer=window.setTimeout(()=>loadDraftList(draftsSearch.value.trim()),250)});
 root.querySelector("#inv-drafts-close").addEventListener("click",()=>draftsDialog.close());
 draftsDialog.addEventListener("click",event=>{if(event.target===draftsDialog)draftsDialog.close()});
 root.querySelector("#inv-save").addEventListener("click",saveDraft);
 root.querySelector("#inv-open").addEventListener("click",openDraft);
 renderRows();
}
