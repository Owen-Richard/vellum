import { createRoot } from 'react-dom/client';
import { useState } from 'react';
function ReviewButton() {
  const [count, setCount] = useState(0);
  return <button data-testid="react-target" onClick={() => setCount(count + 1)}>React action {count}</button>;
}
function ProjectReview() {
  return <main><h1>React project review</h1><section className="panel"><ReviewButton /></section></main>;
}
createRoot(document.querySelector('#app')!).render(<ProjectReview />);
