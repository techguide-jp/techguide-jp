<script lang="ts">
  import type { PageProps } from "./$types";
  import { currentJstMonth } from "$lib/month";

  let { data }: PageProps = $props();
  const currentMonth = $derived(currentJstMonth());
  const workHref = $derived(data.user ? "/work" : "/login");
  const selfSettlementHref = $derived(data.user ? `/settlements/${currentMonth}/${data.user.login}` : "/login");
</script>

<section class="page-heading">
  <p class="eyebrow">help</p>
  <h1>使い方</h1>
  <p>稼働開始から精算確認までの基本的な流れを確認できます。</p>
</section>

<section class="guide-grid" aria-label="主要な使い方">
  <article class="guide-card">
    <span class="step">1</span>
    <div>
      <h2>稼働を記録する</h2>
      <p>
        <a href={workHref}>稼働</a> でProject内Issueを選び、開始ボタンを押します。同じIssueの二重開始はできませんが、別Issueは同時に開始できます。
        固定報酬のIssueでも、作業状況を把握するために稼働記録を入力してください。
      </p>
    </div>
  </article>
  <article class="guide-card">
    <span class="step">2</span>
    <div>
      <h2>終了する</h2>
      <p>
        作業が終わったIssueの終了ボタンを押します。終了が未入力のログは集計対象外になり、未精算予定として確認できます。
      </p>
    </div>
  </article>
  <article class="guide-card">
    <span class="step">3</span>
    <div>
      <h2>ログを修正する</h2>
      <p>
        押し忘れや時刻間違いがある場合は、対象Issueまたは対象ログから追加・修正・除外申請を出します。申請は月次承認時に管理者が採否を決めます。
      </p>
    </div>
  </article>
  <article class="guide-card">
    <span class="step">4</span>
    <div>
      <h2>精算を確認する</h2>
      <p>
        <a href={selfSettlementHref}>自分の精算</a> では月ごとの明細、稼働ログ、未精算予定、承認済みとの差分を確認できます。
      </p>
    </div>
  </article>
  <article class="guide-card">
    <span class="step">5</span>
    <div>
      <h2>月次を確定申請する</h2>
      <p>
        その月の稼働入力が終わったら、自分の精算ページで月次確定申請を出します。未終了ログや未処理の修正申請が残っている場合は申請できません。
      </p>
    </div>
  </article>
</section>

<section class="panel" aria-label="画面ごとの確認内容">
  <div class="columns">
    <div>
      <h2>稼働画面</h2>
      <ul>
        <li><a href={workHref}>稼働画面</a>ではProjectに登録され、自分にassigneeされているIssueを表示します。</li>
        <li>開始するとGitHub ProjectのStatusを作業中へ更新します。</li>
        <li>稼働中のIssueは上部に表示され、終了ボタンから完了できます。</li>
        <li>固定報酬Issueも状況把握のために記録してください。ログは参考表示、ハイブリッドIssueのログは時間精算に反映されます。</li>
      </ul>
    </div>
    <div>
      <h2>自分の精算</h2>
      <ul>
        <li>Issueのclose月をJSTで判定して月次明細に入れます。</li>
        <li>明細にはProject名、Issue、報酬方式、固定報酬、稼働分、時間精算額、小計が表示されます。</li>
        <li>稼働ログでは開始・終了・稼働分・扱い・由来を確認できます。</li>
        <li>未close Issueや、closed済みでもStatusがDoneでないIssueは未精算予定に表示されます。</li>
        <li>月次確定申請を出すと、管理者がその月を承認できるようになります。申請後にログや修正申請の状態が変わった場合は再申請が必要です。</li>
      </ul>
    </div>
  </div>
</section>

<section class="panel">
  <h2>精算ルール</h2>
  <table>
    <tbody>
      <tr>
        <th>成果報酬</th>
        <td>StatusがDoneかつIssueがclosed済みのProject itemだけが対象です。</td>
      </tr>
      <tr>
        <th>精算月</th>
        <td>IssueのclosedAtをJSTに変換した月です。稼働ログも紐づくIssueのclose月に入ります。</td>
      </tr>
      <tr>
        <th>時間精算</th>
        <td>報酬方式がハイブリッドのIssueだけ金額化します。ログごとに時間単価 × 稼働分 / 60 を四捨五入します。</td>
      </tr>
      <tr>
        <th>同時稼働</th>
        <td>複数Issueを同時に稼働した場合、それぞれのIssueに満額の稼働分を計上します。</td>
      </tr>
      <tr>
        <th>未終了ログ</th>
        <td>終了時刻がないログは集計対象外です。終了するか、必要に応じて修正申請を出します。</td>
      </tr>
      <tr>
        <th>税額</th>
        <td>税抜小計に消費税10%を加算して税込合計を表示します。</td>
      </tr>
    </tbody>
  </table>
</section>

<section class="panel">
  <h2>よくある確認</h2>
  <div class="faq-list">
    <article>
      <h3>Issueが稼働画面に出てこない</h3>
      <p>GitHub Project 7に登録され、自分がassigneeになっているか確認します。登録やassigneeが正しいはずなのに表示されない場合は管理者に確認してください。</p>
    </article>
    <article>
      <h3>未精算予定に残っている</h3>
      <p>Issueが未close、またはclosed済みでもProjectのStatusがDoneではない場合は未精算予定に表示されます。精算対象に入れるにはIssueとProjectの状態を確認してください。</p>
    </article>
    <article>
      <h3>ログの時刻を直したい</h3>
      <p>対象Issueまたは対象ログから追加・修正・除外申請を出します。申請した内容は月次承認時に採否が決まります。</p>
    </article>
  </div>
</section>

<style>
  .page-heading {
    margin-bottom: 1rem;
  }

  .eyebrow {
    margin: 0 0 0.25rem;
    color: #66736d;
    font-size: 0.78rem;
    text-transform: uppercase;
  }

  h1,
  h2,
  h3,
  p {
    margin: 0;
  }

  .page-heading h1 {
    font-size: 2.1rem;
  }

  .page-heading p {
    margin-top: 0.4rem;
    color: #52605a;
  }

  h2 {
    margin-bottom: 0.8rem;
    font-size: 1.15rem;
  }

  h3 {
    font-size: 1rem;
  }

  a {
    font-weight: 700;
  }

  .guide-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
    gap: 0.8rem;
    margin-bottom: 1rem;
  }

  .guide-card,
  .panel {
    background: white;
    border: 1px solid #d8ded7;
    border-radius: 8px;
    padding: 1rem;
  }

  .guide-card {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.8rem;
  }

  .guide-card p,
  .faq-list p {
    margin-top: 0.4rem;
    color: #52605a;
    line-height: 1.7;
  }

  .step {
    display: grid;
    width: 2rem;
    height: 2rem;
    place-items: center;
    border-radius: 999px;
    background: #0f766e;
    color: white;
    font-weight: 800;
  }

  .panel {
    margin-bottom: 1rem;
    overflow-x: auto;
  }

  .columns {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
    gap: 1rem;
  }

  ul {
    margin: 0.65rem 0 0;
    padding-left: 1.2rem;
    color: #52605a;
    line-height: 1.75;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th,
  td {
    border-bottom: 1px solid #e5e7eb;
    padding: 0.75rem;
    text-align: left;
    vertical-align: top;
  }

  th {
    width: 9rem;
    color: #172026;
    white-space: nowrap;
  }

  td {
    color: #52605a;
  }

  .faq-list {
    display: grid;
    gap: 0.85rem;
  }

  .faq-list article {
    border-top: 1px solid #e5e7eb;
    padding-top: 0.85rem;
  }

  .faq-list article:first-child {
    border-top: 0;
    padding-top: 0;
  }

  @media (max-width: 640px) {
    .guide-card {
      grid-template-columns: 1fr;
    }

    th,
    td {
      display: block;
      width: auto;
      padding: 0.65rem 0;
    }

    tr {
      display: block;
      border-bottom: 1px solid #e5e7eb;
    }

    th,
    td {
      border-bottom: 0;
    }
  }
</style>
