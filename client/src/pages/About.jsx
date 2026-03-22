import styles from "./About.module.css";
import homeStyles from "./Home.module.css";

const VALUES = [
  {
    title: "Без цензуры",
    text: "MyCloud создан для артистов, которые хотят публиковать музыку без давления алгоритмов, лейблов и навязанных рамок.",
  },
  {
    title: "Прямой контакт",
    text: "Мы за честную связь между артистом и слушателем: без лишних посредников, без искусственного занижения охватов и без скрытых правил.",
  },
  {
    title: "Своя площадка",
    text: "Проект можно развернуть на собственном сервере и держать под полным контролем — музыку, данные, оформление и правила внутри сообщества.",
  },
];

export default function About() {
  return (
    <main className={homeStyles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>About MyCloud</p>
        <h1 className={styles.title}>Музыкальная платформа для тех, кто не хочет молчать.</h1>
        <p className={styles.lead}>
          Мы верим, что музыка не должна проходить через фильтры цензуры, бездушные рекомендации и чужие правила.
          MyCloud — это пространство, где артист сам решает, как звучать, а слушатель сам выбирает, что поддерживать.
        </p>
      </section>

      <section className={styles.grid}>
        {VALUES.map((item) => (
          <article key={item.title} className={styles.card}>
            <h2>{item.title}</h2>
            <p>{item.text}</p>
          </article>
        ))}
      </section>

      <section className={styles.manifesto}>
        <div className={styles.manifestoInner}>
          <h2>Наш манифест</h2>
          <p>
            Мы против культурной стерильности, против удушающей модерации ради удобства рекламных систем
            и против идеи, что независимая музыка должна подстраиваться под чужой формат.
          </p>
          <p>
            Если артист хочет выпускать сырые демо, социально острые тексты, андеграундные релизы
            или просто строить своё независимое комьюнити — у него должна быть такая возможность.
          </p>
        </div>
      </section>
    </main>
  );
}
