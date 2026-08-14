/**
 * A menu item as a customer reads it.
 *
 * <p>Deliberately narrower than the admin `CafeItem`: no `active`, because everything the public
 * endpoint returns is on sale, and no `displayOrder`, because the server sends the list already
 * in order. Mirroring the admin shape here would invite a component to render a field the public
 * response does not carry.
 *
 * <p>`pricePence` is integer pence, formatted at the edge with `formatPence`.
 */
export interface MenuItem {
  id: number;
  name: string;
  description: string | null;
  pricePence: number;
  imageUrl: string | null;
}
