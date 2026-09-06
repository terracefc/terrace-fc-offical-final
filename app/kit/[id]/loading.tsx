export default function KitLoading() {
  return (
    <main className="min-h-screen bg-background px-4 pb-20 pt-28 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl animate-pulse gap-8 lg:grid-cols-2 lg:gap-14">
        <div className="aspect-square rounded-3xl bg-secondary" />
        <div className="space-y-5 pt-2">
          <div className="h-4 w-28 rounded-full bg-secondary" />
          <div className="h-12 w-4/5 rounded-xl bg-secondary" />
          <div className="h-5 w-2/3 rounded-lg bg-secondary" />
          <div className="h-10 w-36 rounded-xl bg-secondary" />
          <div className="grid grid-cols-4 gap-3 pt-4">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-14 rounded-xl bg-secondary" />
            ))}
          </div>
          <div className="h-14 rounded-2xl bg-secondary" />
        </div>
      </div>
    </main>
  )
}
