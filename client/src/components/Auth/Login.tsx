function Login() {
  return (
    <section
      aria-label="서비스 종료 안내"
      className="flex flex-col items-center px-2 pb-2 text-center"
    >
      <span className="mb-6 inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-green-600" />
        서비스 안내
      </span>
      <h1 className="text-2xl font-semibold leading-snug text-gray-900">
        bkl DB AI MVP 서비스가
        <br />
        종료되었습니다.
      </h1>
      <p className="mt-5 text-sm leading-relaxed text-gray-600">
        2026년 8월, 전사 최근 3개년 종결 사건을 대상으로
        <br />
        베타 테스트를 시작할 예정입니다.
      </p>
      <p className="mt-8 text-sm leading-relaxed text-gray-500">
        MVP 이용 과정에서 건의하실 사항이 있으시면
        <br />
        KM팀으로 전달 부탁드립니다.
      </p>
    </section>
  );
}

export default Login;
