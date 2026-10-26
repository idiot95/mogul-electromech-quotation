import { Link } from "react-router";
import { Anchor, Center, Stack, Title } from "@mantine/core";

export function NotFound() {
  return (
    <Center py={80}>
      <Stack align="center">
        <Title order={3}>Page not found</Title>
        <Anchor component={Link} to="/">Back to Home</Anchor>
      </Stack>
    </Center>
  );
}
