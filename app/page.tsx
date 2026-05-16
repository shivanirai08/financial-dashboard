export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,_#07111f_0%,_#04070d_100%)] px-6 text-white">
      <form
        action="/api/sync"
        method="post"
        className="flex w-full max-w-xl flex-col gap-4"
      >
        <input
          type="text"
          name="query"
          className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-base text-white outline-none placeholder:text-slate-400 focus:border-cyan-300"
          placeholder="Enter text"
        />
        <button className="secondary-button" type="submit">
          Submit
        </button>
      </form>
    </main>
  );
}
