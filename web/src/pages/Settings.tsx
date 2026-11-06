import { useEffect, useState } from "react";
import { Button, Divider, Group, Image, NumberInput, Paper, SimpleGrid, Stack, Switch, TextInput, Textarea, Title } from "@mantine/core";
import { IconDeviceFloppy } from "@tabler/icons-react";
import { api } from "../lib/api";
import type { CompanySettings, QuoteSettings } from "../lib/types";
import { useApp } from "../core/app-context";
import { Page } from "../core/Page";

export function SettingsPage() {
  const { settings, reload, toast } = useApp();
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [quotes, setQuotes] = useState<QuoteSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setCompany(settings.company);
      setQuotes(settings.quotes);
    }
  }, [settings]);

  if (!company || !quotes) return null;

  async function save() {
    setSaving(true);
    try {
      await api.put("/settings/company", company);
      await api.put("/settings/quotes", { ...quotes, vatRate: Number(quotes!.vatRate) || 0 });
      await reload();
      toast("Settings saved");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setSaving(false);
    }
  }

  const c = (k: keyof CompanySettings) => ({ value: company[k], onChange: (e: { currentTarget: { value: string } }) => setCompany({ ...company, [k]: e.currentTarget.value }) });
  const q = (k: keyof QuoteSettings) => ({ value: String(quotes[k] ?? ""), onChange: (e: { currentTarget: { value: string } }) => setQuotes({ ...quotes, [k]: e.currentTarget.value }) });

  return (
    <Page crumbs={[{ label: "Dashboard", to: "/" }]} title="Settings" actions={<Button leftSection={<IconDeviceFloppy size={16} />} loading={saving} onClick={save}>Save</Button>}>
      <Paper p="lg">
        <Stack gap="md">
          <Title order={4}>Company Details</Title>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
            <TextInput label="Company Name" {...c("name")} />
            <TextInput label="TRN" {...c("trn")} />
            <TextInput label="Email" {...c("email")} />
            <TextInput label="Telephone" {...c("phone")} />
            <TextInput label="Fax" {...c("fax")} />
          </SimpleGrid>
          <Textarea label="Address" autosize minRows={2} {...c("address")} />
          <Group gap="lg" mt="xs">
            <Paper p={6} withBorder><Image src="/logo.jpg" alt="Logo" h={48} w="auto" /></Paper>
            <Image src="/stamp.jpg" alt="Stamp" h={64} w="auto" />
          </Group>
        </Stack>
      </Paper>

      <Paper p="lg">
        <Stack gap="md">
          <Title order={4}>Quotation Defaults</Title>
          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
            <TextInput label="Number Prefix" {...q("series")} />
            <NumberInput label="VAT %" value={quotes.vatRate} min={0} max={100} decimalScale={2} onChange={(v) => setQuotes({ ...quotes, vatRate: Number(v) || 0 })} />
            <TextInput label="Currency" {...q("currency")} />
            <TextInput label="Default Unit" {...q("defaultUnit")} />
          </SimpleGrid>
          <Divider label="Default Terms" labelPosition="left" />
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <TextInput label="Payment Terms" {...q("paymentTerms")} />
            <TextInput label="Validity" {...q("validity")} />
            <TextInput label="Delivery Terms" {...q("deliveryTerms")} />
            <TextInput label="VAT Terms" {...q("vatTerms")} />
          </SimpleGrid>
          <TextInput label="Document Footer" {...q("footerNote")} />
          <Switch
            mt="xs"
            label="Show VAT Amount and Total on Document"
            checked={quotes.showVatAmount}
            onChange={(e) => setQuotes({ ...quotes, showVatAmount: e.currentTarget.checked })}
          />
        </Stack>
      </Paper>

    </Page>
  );
}
