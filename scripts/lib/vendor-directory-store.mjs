export const DIRECTORY_CATEGORIES = [
  { slug: 'cooling', title: 'Cooling', sponsorSlot: 'category_lane_sponsor_cooling' },
  { slug: 'power-grid', title: 'Power & Grid', sponsorSlot: 'category_lane_sponsor_power_grid' },
  { slug: 'data-center-developers', title: 'Data Center Developers', sponsorSlot: 'vendor_directory_featured' },
  { slug: 'semiconductors', title: 'Semiconductors', sponsorSlot: 'category_lane_sponsor_silicon' },
  { slug: 'networking', title: 'Networking', sponsorSlot: 'vendor_directory_featured' },
  { slug: 'storage', title: 'Storage', sponsorSlot: 'vendor_directory_featured' },
  { slug: 'consultants', title: 'Consultants', sponsorSlot: 'vendor_directory_featured' },
  { slug: 'project-finance', title: 'Project Finance', sponsorSlot: 'category_lane_sponsor_capital' },
  { slug: 'legal-permitting', title: 'Legal & Permitting', sponsorSlot: 'vendor_directory_featured' },
];

export const DIRECTORY_LISTINGS = [
  {
    company_name: 'Example Liquid Cooling Supplier',
    category: 'cooling',
    region: 'North America',
    description: 'Placeholder listing for direct-to-chip, CDU, and thermal services vendors.',
    website: '',
    verified: false,
    featured: false,
    sponsor_tier: '',
    contact_url: '/contact/',
  },
  {
    company_name: 'Example Power Advisory Firm',
    category: 'power-grid',
    region: 'United States',
    description: 'Placeholder listing for power procurement, interconnection, and utility strategy support.',
    website: '',
    verified: false,
    featured: false,
    sponsor_tier: '',
    contact_url: '/contact/',
  },
];

export function directoryCategoryBySlug(slug) {
  return DIRECTORY_CATEGORIES.find((category) => category.slug === slug) || null;
}

export function listingsForCategory(slug) {
  return DIRECTORY_LISTINGS.filter((listing) => listing.category === slug);
}
