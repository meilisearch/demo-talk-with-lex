import { SearchPage } from "./_components/search-page";
import { searchFromParams } from "./_components/search-params";
import { SearchStoreProvider } from "./_components/search-store";

export default async function Home({ searchParams }: PageProps<"/">) {
  return (
    <SearchStoreProvider initial={searchFromParams(await searchParams)}>
      <SearchPage />
    </SearchStoreProvider>
  );
}
