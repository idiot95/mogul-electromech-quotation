import { useMemo } from "react";
import { Combobox, Group, InputBase, Text, useCombobox } from "@mantine/core";
import { IconBuildingFactory2, IconPlus } from "@tabler/icons-react";
import type { Customer } from "../../lib/types";

/** Searchable customer drop-down with "+ New customer" at the bottom (Mantine creatable combobox). */
export function CustomerPicker(props: {
  customers: Customer[];
  value: string;
  selectedId: number | null;
  readOnly?: boolean;
  label?: string;
  onPick: (c: Customer) => void;
  onNew: (name: string) => void;
  onType: (name: string) => void;
}) {
  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() });
  const q = props.value.trim().toLowerCase();
  const matches = useMemo(() => {
    const act = props.customers.filter((c) => c.active);
    if (!q || props.selectedId) return act.slice(0, 60);
    const starts = act.filter((c) => c.name.toLowerCase().startsWith(q));
    const rest = act.filter((c) => !c.name.toLowerCase().startsWith(q) && c.name.toLowerCase().includes(q));
    return [...starts, ...rest].slice(0, 60);
  }, [props.customers, q, props.selectedId]);

  return (
    <Combobox
      store={combobox}
      withinPortal
      onOptionSubmit={(val) => {
        combobox.closeDropdown();
        if (val === "$new") props.onNew(props.selectedId ? "" : props.value.trim());
        else {
          const c = props.customers.find((x) => String(x.id) === val);
          if (c) props.onPick(c);
        }
      }}
    >
      <Combobox.Target>
        <InputBase
          label={props.label}
          size="md"
          leftSection={<IconBuildingFactory2 size={18} />}
          rightSection={<Combobox.Chevron />}
          rightSectionPointerEvents="none"
          value={props.value}
          readOnly={props.readOnly}
          placeholder="Search"
          onChange={(e) => {
            props.onType(e.currentTarget.value);
            combobox.openDropdown();
            combobox.updateSelectedOptionIndex();
            combobox.selectFirstOption();
          }}
          onClick={() => !props.readOnly && combobox.openDropdown()}
          onFocus={() => !props.readOnly && combobox.openDropdown()}
          onBlur={() => combobox.closeDropdown()}
        />
      </Combobox.Target>
      <Combobox.Dropdown hidden={props.readOnly}>
        <Combobox.Options mah={300} style={{ overflowY: "auto" }}>
          {matches.map((c) => (
            <Combobox.Option value={String(c.id)} key={c.id} active={c.id === props.selectedId}>
              <Text fz="sm">{c.name}</Text>
              {(c.payment_terms || c.validity) && <Text fz="xs" c="dimmed">{[c.payment_terms, c.validity].filter(Boolean).join(" · ")}</Text>}
            </Combobox.Option>
          ))}
          {!matches.length && <Combobox.Empty>No customer matches “{props.value}”</Combobox.Empty>}
        </Combobox.Options>
        <Combobox.Footer>
          <Combobox.Options>
            <Combobox.Option value="$new">
              <Group gap={6} c="stamp.6">
                <IconPlus size={14} />
                <Text fz="sm" fw={600}>New Customer{props.value.trim() && !props.selectedId ? ` “${props.value.trim()}”` : ""}</Text>
              </Group>
            </Combobox.Option>
          </Combobox.Options>
        </Combobox.Footer>
      </Combobox.Dropdown>
    </Combobox>
  );
}
