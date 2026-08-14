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

/**
 * One section of the menu: a heading and the items under it.
 *
 * <p>Grouped by the server rather than here, because the section order is the club's own and a
 * client regrouping a flat list would have to be told that order separately. `code` is null for
 * the uncategorised section, which the server labels "Other" and always puts last.
 */
export interface MenuSection {
  code: string | null;
  label: string;
  items: MenuItem[];
}
