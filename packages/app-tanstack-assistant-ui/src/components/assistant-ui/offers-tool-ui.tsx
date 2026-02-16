/**
 * Custom Tool UI for rendering commerce offers from get_commerce_offers MCP tool
 */

import { makeAssistantToolUI } from "@assistant-ui/react";

interface Offer {
  id: string;
  title: string;
  description?: string;
  price?: string;
  url?: string;
  image_url?: string;
  advertiser?: string;
}

interface OffersData {
  offers: Offer[];
  total: number;
  query: string;
}

export const OffersToolUI = makeAssistantToolUI<
  { query: string }, // Tool arguments
  unknown // Tool result (raw MCP structure)
>({
  toolName: "get_commerce_offers",
  render: ({ result, status }) => {
    // Show loading state
    if (status === "running") {
      return (
        <div className="rounded-md border p-3 text-sm text-gray-500">
          Searching for offers...
        </div>
      );
    }

    // No result yet
    if (!result) return null;

    try {
      // Parse MCP result structure: { content: [{ type: "text", text: "..." }] }
      const content = (result as any)?.content?.[0];
      if (!content || content.type !== "text") {
        return null;
      }

      // Parse the JSON string inside text
      const data: OffersData = JSON.parse(content.text);
      const offers = data?.offers;

      // Handle no offers
      if (!offers || !Array.isArray(offers) || offers.length === 0) {
        return (
          <div className="rounded-md border p-3 text-sm text-gray-500">
            No offers found for "{data?.query}"
          </div>
        );
      }

      // Render offers with images
      return (
        <div className="space-y-3">
          <div className="text-xs text-gray-500 mb-2">
            Found {offers.length} offer{offers.length !== 1 ? "s" : ""} for "
            {data.query}"
          </div>
          {offers.map((offer, index) => (
            <div
              key={offer.id || index}
              className="rounded-md border p-3 flex gap-3 hover:bg-gray-50 transition-colors"
            >
              {offer.image_url && (
                <img
                  src={offer.image_url}
                  alt={offer.title}
                  className="w-20 h-20 object-cover rounded flex-shrink-0"
                  loading="lazy"
                />
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm truncate">
                  {offer.title}
                </h3>
                {offer.description && (
                  <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                    {offer.description}
                  </p>
                )}
                <div className="flex items-center justify-between mt-2">
                  {offer.price && (
                    <span className="font-bold text-sm text-green-700">
                      {offer.price}
                    </span>
                  )}
                  {offer.url && (
                    <a
                      href={offer.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      View offer →
                    </a>
                  )}
                </div>
                {offer.advertiser && (
                  <p className="text-xs text-gray-500 mt-1">
                    by {offer.advertiser}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      );
    } catch (error) {
      console.error("Error rendering offers:", error);
      return (
        <div className="rounded-md border p-3 text-sm text-red-500">
          Error displaying offers
        </div>
      );
    }
  },
});
