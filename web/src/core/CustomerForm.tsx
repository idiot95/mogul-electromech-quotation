import { useState } from "react";
import { Button, Checkbox, Divider, Group, Modal, SimpleGrid, Stack, Text, TextInput, Textarea } from "@mantine/core";
import { api } from "../lib/api";
import type { Customer } from "../lib/types";
import { useApp } from "./app-context";

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
  const f = (k: keyof Customer) => ({
    value: (d[k] as string) || "",
    onChange: (e: { currentTarget: { value: string } }) => setD({ ...d, [k]: e.currentTarget.value }),
  });

  async function save() {
    if (!d.name.trim()) return toast("Customer name is required", true);
    setBusy(true);
    try {
      const saved = props.customer ? await api.put<Customer>(`/customers/${props.customer.id}`, d) : await api.post<Customer>("/customers", d);
      toast(props.customer ? "Customer saved" : "Customer added");
      props.onSaved(saved);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal opened onClose={props.onClose} title={<Text fw={700} ff="heading" fz="lg">{props.customer ? "Edit customer" : "New customer"}</Text>} size="lg">
      <Stack gap="sm">
        <TextInput label="Customer name" required data-autofocus {...f("name")} />
        <Textarea label="Address" description='Printed under "To,"' autosize minRows={2} {...f("address")} />
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <TextInput label="Contact person" {...f("contact_person")} />
          <TextInput label="Email" type="email" {...f("email")} />
          <TextInput label="Phone" {...f("phone")} />
          <TextInput label="TRN" {...f("trn")} />
        </SimpleGrid>
        <Divider label="Default terms · copied onto every new quote for this customer" labelPosition="left" mt="xs" />
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <TextInput label="Payment terms" {...f("payment_terms")} />
          <TextInput label="Quote validity" {...f("validity")} />
          <TextInput label="Delivery terms" {...f("delivery_terms")} />
          <TextInput label="VAT terms" {...f("vat_terms")} />
        </SimpleGrid>
        <Textarea label="Internal notes" autosize minRows={2} {...f("notes")} />
        <Group justify="space-between" mt="sm">
          {props.customer ? (
            <Checkbox label="Active (shown in the customer list)" checked={d.active !== 0} onChange={(e) => setD({ ...d, active: e.currentTarget.checked ? 1 : 0 })} />
          ) : <span />}
          <Group gap="sm">
            <Button variant="default" onClick={props.onClose}>Cancel</Button>
            <Button onClick={save} loading={busy}>Save customer</Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
