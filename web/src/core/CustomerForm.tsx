import { useState } from "react";
import { api } from "../lib/api";
import type { Customer } from "../lib/types";
import { useApp } from "./app-context";
import { Modal } from "./Modal";

type Draft = Partial<Customer> & { name: string };

export function CustomerForm(props: { customer?: Customer | null; initialName?: string; onClose: () => void; onSaved: (c: Customer) => void }) {
  const { settings, toast } = useApp();
  const q = settings?.quotes;
  const [d, setD] = useState<Draft>(
    props.customer ?? {
      name: props.initialName || "",
      payment_terms: q?.paymentTerms || "",
      validity: q?.validity || "",
      delivery_terms: q?.deliveryTerms || "",
      vat_terms: q?.vatTerms || "",
    },
  );
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Customer) => (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value });

  async function save() {
    if (!d.name.trim()) return toast("Customer name is required", true);
    setBusy(true);
    try {
      const saved = props.customer
        ? await api.put<Customer>(`/customers/${props.customer.id}`, d)
        : await api.post<Customer>("/customers", d);
      toast(props.customer ? "Customer saved" : "Customer added");
      props.onSaved(saved);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={props.customer ? "Edit customer" : "New customer"}
      onClose={props.onClose}
      footer={
        <>
          {props.customer && (
            <label className="check" style={{ marginRight: "auto" }}>
              <input type="checkbox" checked={d.active !== 0} onChange={(e) => setD({ ...d, active: e.target.checked ? 1 : 0 })} />
              Active (shown in the customer list)
            </label>
          )}
          <button className="btn" onClick={props.onClose}>Cancel</button>
          <button className="btn p" onClick={save} disabled={busy}>Save customer</button>
        </>
      }
    >
      <label className="f">
        <span>Customer name *</span>
        <input autoFocus value={d.name} onChange={set("name")} />
      </label>
      <label className="f">
        <span>Address (printed under "To,")</span>
        <textarea rows={3} value={d.address || ""} onChange={set("address")} />
      </label>
      <div className="grid2">
        <label className="f"><span>Contact person</span><input value={d.contact_person || ""} onChange={set("contact_person")} /></label>
        <label className="f"><span>Email</span><input type="email" value={d.email || ""} onChange={set("email")} /></label>
        <label className="f"><span>Phone</span><input value={d.phone || ""} onChange={set("phone")} /></label>
        <label className="f"><span>TRN</span><input value={d.trn || ""} onChange={set("trn")} /></label>
      </div>
      <div className="cap">Default terms · copied onto every new quote for this customer</div>
      <div className="grid2">
        <label className="f"><span>Payment terms</span><input value={d.payment_terms || ""} onChange={set("payment_terms")} /></label>
        <label className="f"><span>Quote validity</span><input value={d.validity || ""} onChange={set("validity")} /></label>
        <label className="f"><span>Delivery terms</span><input value={d.delivery_terms || ""} onChange={set("delivery_terms")} /></label>
        <label className="f"><span>VAT terms</span><input value={d.vat_terms || ""} onChange={set("vat_terms")} /></label>
      </div>
      <label className="f"><span>Internal notes</span><textarea rows={2} value={d.notes || ""} onChange={set("notes")} /></label>
    </Modal>
  );
}
