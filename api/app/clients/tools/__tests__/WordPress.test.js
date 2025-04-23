const WordPress = require('../structured/WordPress');
require('dotenv').config();

// Check if WordPress credentials are available
const hasWordPressCredentials =
  process.env.WORDPRESS_BASE_URL &&
  process.env.WORDPRESS_USERNAME &&
  process.env.WORDPRESS_PASSWORD;

// Conditionally run tests based on credential availability
(hasWordPressCredentials ? describe : describe.skip)('WordPress Plugin Test Suite', () => {
  let wpTool;
  let token;
  let testPostId = 0;

  beforeAll(async () => {
    // Create WordPress instance
    wpTool = new WordPress({
      WORDPRESS_BASE_URL: process.env.WORDPRESS_BASE_URL,
      WORDPRESS_USERNAME: process.env.WORDPRESS_USERNAME,
      WORDPRESS_PASSWORD: process.env.WORDPRESS_PASSWORD,
    });

    // If running in CI without credentials, mock the WordPress methods
    if (process.env.NODE_ENV === 'CI' && !hasWordPressCredentials) {
      // Mock implementations for testing
      wpTool.createPost = jest.fn().mockResolvedValue({
        id: 123,
        title: { rendered: 'Test Page Title' },
      });

      wpTool.editPost = jest.fn().mockResolvedValue({
        id: 123,
        title: { rendered: 'Updated Test Post Title' },
      });

      wpTool.deletePost = jest.fn().mockResolvedValue({ id: 123 });

      wpTool.addCategory = jest.fn().mockImplementation((token, name) => {
        return Promise.resolve({ id: 456, name });
      });

      wpTool.updateCategoryOrTag = jest.fn().mockImplementation((token, id, name) => {
        return Promise.resolve({
          id,
          message: name.includes('Category') ? 'Category updated successfully' : 'Tag updated successfully',
        });
      });

      wpTool.deleteCategory = jest.fn().mockResolvedValue({
        message: 'Category deleted successfully',
      });

      wpTool.addTag = jest.fn().mockImplementation((token, name) => {
        return Promise.resolve({ id: 789, name });
      });

      wpTool.deleteTag = jest.fn().mockResolvedValue({
        message: 'Tag deleted successfully',
      });

      wpTool.listCategories = jest.fn().mockResolvedValue([
        { id: 1, name: 'Category 1' },
        { id: 2, name: 'Category 2' },
      ]);

      wpTool.listTags = jest.fn().mockResolvedValue([
        { id: 1, name: 'Tag 1' },
        { id: 2, name: 'Tag 2' },
      ]);

      wpTool.searchPosts = jest.fn().mockResolvedValue([
        { id: 1, title: { rendered: 'Test Post 1' } },
        { id: 2, title: { rendered: 'Test Post 2' } },
      ]);

      wpTool.searchByMeta = jest.fn().mockResolvedValue([
        { id: 1, title: { rendered: 'Test Post 1' }, meta: { age_: ['22'] } },
      ]);

      wpTool.updatePostMeta = jest.fn().mockResolvedValue({
        id: 123,
        message: 'Post meta updated successfully',
      });

      wpTool.getPostMeta = jest.fn().mockResolvedValue({ key: 'value' });

      wpTool.updateImageMeta = jest.fn().mockResolvedValue({
        message: 'Image metadata updated successfully',
      });

      wpTool.listPaginatedPosts = jest.fn().mockResolvedValue([
        { id: 1, title: 'Post 1', status: 'publish' },
        { id: 2, title: 'Post 2', status: 'draft' },
      ]);

      wpTool.setAIImageAsFeatured = jest.fn().mockResolvedValue({
        image_url: 'https://example.com/wp-content/uploads/image.png',
      });

      wpTool._call = jest.fn().mockImplementation((args) => {
        return Promise.resolve(JSON.stringify({ success: true, action: args.action }));
      });
    }

    token = await wpTool.getToken();
  });

  // ✅ Test : Authentication
  test('Should authenticate and get JWT token', async () => {
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
  });

  // ✅ Test : Token Caching
  test('Should return cached token on subsequent calls', async () => {
    const cachedToken = await wpTool.getToken();
    expect(cachedToken).toBe(token);
  });

  // ✅ Test : Create Post
  test('Should create a new page', async () => {
    const newPost = await wpTool.createPost(
      token,
      'Test Page Title',
      'This is the content of the test page',
      'draft',
      'page',
    );
    expect(newPost).toHaveProperty('id');
    expect(newPost.title.rendered).toBe('Test Page Title');
  });

  let categoryId = '0';
  // ✅ Test : Add Category
  test('Should add a new category', async () => {
    const category_name = 'Test Category ' + Math.round(Math.random() * 100000);
    const newCategory = await wpTool.addCategory(token, category_name, 'Category for testing');
    categoryId = newCategory.id;
    expect(newCategory).toHaveProperty('id');
    expect(newCategory.name).toBe(category_name);
  });

  // ✅ Test : Update Category
  test('Should update a category', async () => {
    const updatedCategoryName = 'Updated Category Name ' + Math.round(Math.random() * 100000);
    const updatedCategory = await wpTool.updateCategoryOrTag(
      token,
      categoryId,
      updatedCategoryName,
      'aa',
      'categories',
    );

    expect(updatedCategory).toHaveProperty('id', categoryId);
    expect(updatedCategory).toHaveProperty('message', 'Category updated successfully');
  });

  // ✅ Test : List Categories
  test('Should list all categories', async () => {
    const categoryList = await wpTool.listCategories(token);
    expect(Array.isArray(categoryList)).toBe(true);
    expect(categoryList.length).toBeGreaterThan(0);
    categoryList.forEach((category) => {
      expect(category).toHaveProperty('id');
      expect(category).toHaveProperty('name');
    });
  });

  // ✅ Test : Delete Category
  test('Should delete a category', async () => {
    const deleteResult = await wpTool.deleteCategory(token, categoryId);
    expect(deleteResult).toHaveProperty('message', 'Category deleted successfully');
  });

  // ✅ Test : Add Tag
  let tagId = '0';
  test('Should add a new tag', async () => {
    const tag_name = 'Test Tag ' + Math.round(Math.random() * 100000);
    const newTag = await wpTool.addTag(token, tag_name, 'Tag for testing');
    tagId = newTag.id;
    expect(newTag).toHaveProperty('id');
    expect(newTag.name).toBe(tag_name);
  });

  // ✅ Test : Update Tag
  test('Should update a tag', async () => {
    const updatedTagName = 'Updated Tag Name ' + Math.round(Math.random() * 100000);
    const updatedTag = await wpTool.updateCategoryOrTag(
      token,
      tagId,
      updatedTagName,
      'aa',
      'tags',
    );

    expect(updatedTag).toHaveProperty('id', tagId);
    expect(updatedTag).toHaveProperty('message', 'Tag updated successfully');
  });

  // ✅ Test : List Tags
  test('Should list all tags', async () => {
    const tagList = await wpTool.listTags(token);
    expect(Array.isArray(tagList)).toBe(true);
    expect(tagList.length).toBeGreaterThan(0);
    tagList.forEach((tag) => {
      expect(tag).toHaveProperty('id');
      expect(tag).toHaveProperty('name');
    });
  });

  // ✅ Test : Delete Tag
  test('Should delete a tag', async () => {
    const deleteResult = await wpTool.deleteTag(token, tagId);
    expect(deleteResult).toHaveProperty('message', 'Tag deleted successfully');
  });

  // ✅ Test : Create Post with Tag via _call method
  test('Should create a new post with a tag', async () => {
    const newTag = await wpTool.addTag(token, 'Test Tag ' + Math.round(Math.random() * 100000), 'Tag for testing');

    const input = {
      'action': 'createPost',
      'title': 'Test Post with New Tag',
      'content': 'Content of the post with a new tag',
      'status': 'publish',
      'type': 'post',
      'tags': [newTag.id],
      'date': '2025-01-20T10:00:00',
    };

    const response = await wpTool._call(input);
    const response_ar = JSON.parse(response);
    expect(response_ar).toHaveProperty('id');
    expect(response_ar.title).toBe('Test Post with New Tag');
  });

  // ✅ Test : Create Post with Category via _call method
  test('Should create a new post with a category', async () => {
    const newCategory = await wpTool.addCategory(token, 'Test Category ' + Math.round(Math.random() * 100000), 'Category for testing');
    const input = {
      'action': 'createPost',
      'title': 'Test Post with New Category',
      'content': 'Content of the post with a new category',
      'status': 'publish',
      'type': 'post',
      'categories': [newCategory.id],
      'date': '2025-01-20T10:00:00',
    };
    const response = await wpTool._call(input);
    const response_ar = JSON.parse(response);
    expect(response_ar).toHaveProperty('id');
    expect(response_ar.title).toBe('Test Post with New Category');
  });

  // ✅ Test : Create Post
  test('Should create a new post', async () => {
    const newPost = await wpTool.createPost(
      token,
      'Test Post Title',
      'This is the content of the test post',
      'draft',
    );
    testPostId = newPost.id;
    expect(newPost).toHaveProperty('id');
    expect(newPost.title.rendered).toBe('Test Post Title');
  });

  // ✅ Test : Update Post Title
  test('Should update the post title', async () => {
    const updatedPost = await wpTool.editPost(token, testPostId, { title: 'Updated Test Post Title' });
    expect(updatedPost).toHaveProperty('id');
    expect(updatedPost.title.rendered).toBe('Updated Test Post Title');
  });

  // ✅ Test : Set AI Image as Featured
  test('Should set an AI image as featured', async () => {
    // Sample base64 image (minimal valid PNG)
    const sampleBase64 = 'iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAApgAAAKYB3X3/OAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAANCSURBVEiJtZZPbBtFFMZ/M7ubXdtdb1xSFyeilBapySVU8h8OoFaooFSqiihIVIpQBKci6KEg9Q6H9kovIHoCIVQJJCKE1ENFjnAgcaSGC6rEnxBwA04Tx43t2FnvDAfjkNibxgHxnWb2e/u992bee7tCa00YFsffekFY+nUzFtjW0LrvjRXrCDIAaPLlW0nHL0SsZtVoaF98mLrx3pdhOqLtYPHChahZcYYO7KvPFxvRl5XPp1sN3adWiD1ZAqD6XYK1b/dvE5IWryTt2udLFedwc1+9kLp+vbbpoDh+6TklxBeAi9TL0taeWpdmZzQDry0AcO+jQ12RyohqqoYoo8RDwJrU+qXkjWtfi8Xxt58BdQuwQs9qC/afLwCw8tnQbqYAPsgxE1S6F3EAIXux2oQFKm0ihMsOF71dHYx+f3NND68ghCu1YIoePPQN1pGRABkJ6Bus96CutRZMydTl+TvuiRW1m3n0eDl0vRPcEysqdXn+jsQPsrHMquGeXEaY4Yk4wxWcY5V/9scqOMOVUFthatyTy8QyqwZ+kDURKoMWxNKr2EeqVKcTNOajqKoBgOE28U4tdQl5p5bwCw7BWquaZSzAPlwjlithJtp3pTImSqQRrb2Z8PHGigD4RZuNX6JYj6wj7O4TFLbCO/Mn/m8R+h6rYSUb3ekokRY6f/YukArN979jcW+V/S8g0eT/N3VN3kTqWbQ428m9/8k0P/1aIhF36PccEl6EhOcAUCrXKZXXWS3XKd2vc/TRBG9O5ELC17MmWubD2nKhUKZa26Ba2+D3P+4/MNCFwg59oWVeYhkzgN/JDR8deKBoD7Y+ljEjGZ0sosXVTvbc6RHirr2reNy1OXd6pJsQ+gqjk8VWFYmHrwBzW/n+uMPFiRwHB2I7ih8ciHFxIkd/3Omk5tCDV1t+2nNu5sxxpDFNx+huNhVT3/zMDz8usXC3ddaHBj1GHj/As08fwTS7Kt1HBTmyN29vdwAw+/wbwLVOJ3uAD1wi/dUH7Qei66PfyuRj4Ik9is+hglfbkbfR3cnZm7chlUWLdwmprtCohX4HUtlOcQjLYCu+fzGJH2QRKvP3UNz8bWk1qMxjGTOMThZ3kvgLI5AzFfo379UAAAAASUVORK5CYII=';

    const imageResult = await wpTool.setAIImageAsFeatured(
      token,
      testPostId,
      sampleBase64,
      'AI Image',
      'Generated by AI',
      'AI Landscape',
    );
    expect(imageResult).toHaveProperty('image_url');
    expect(imageResult.image_url).toContain('wp-content/uploads');
  });

  // ✅ Test : Search Posts by Keyword
  test('Should search for posts by keyword', async () => {
    const keyword = 'Test'; // Keyword to search for
    const searchResults = await wpTool.searchPosts(
      token,
      'contains', // searchType
      keyword,    // searchValue
      null,       // tagId
      null,       // tagName
      null,       // categoryId
      null,       // categoryName
      'post',      // type
    );

    expect(Array.isArray(searchResults)).toBe(true);
    expect(searchResults.length).toBeGreaterThan(0);

    searchResults.forEach((post) => {
      expect(post.title.rendered.toLowerCase()).toContain(keyword.toLowerCase());
    });
  });

  // ✅ Test : Update Post Metadata via _call
  test('Should update post metadata', async () => {
    const metaKey = 'age_';
    const metaValue = '22';
    const input = {
      'action': 'updatePostMeta',
      'postId': testPostId,
      'metaKey': metaKey,
      'metaValue': metaValue,
    };
    const updateResult = await wpTool._call(input);
    const updateResult_ar = JSON.parse(updateResult);
    expect(updateResult_ar).toHaveProperty('message', 'Post meta updated successfully');
  });

  // ✅ Test : Search Posts by Metadata
  test('Should search for posts by metadata', async () => {
    const metaKey = 'age_';
    const metaValue = '22';
    const searchResults = await wpTool.searchByMeta(token, metaKey, metaValue);

    expect(Array.isArray(searchResults)).toBe(true);
    expect(searchResults.length).toBeGreaterThan(0);

    searchResults.forEach((post) => {
      expect(Array.isArray(post.meta[metaKey])).toBe(true);
      expect(post.meta[metaKey][0]).toBe(metaValue);
    });
  });

  // ✅ Test : Get Post Meta
  test('Should fetch post meta', async () => {
    const meta = await wpTool.getPostMeta(token, testPostId);
    expect(meta).toBeDefined();
  });

  // ✅ Test : Update Image Metadata
  test('Should update image metadata', async () => {
    const updateResult = await wpTool.updateImageMeta(
      token,
      testPostId,
      null,
      'Updated Image Title',
      'New Caption',
      'Updated Alt Text',
    );
    expect(updateResult).toHaveProperty('message', 'Image metadata updated successfully');
  });

  // ✅ Test : List Paginated Posts
  test('Should list paginated posts', async () => {
    const posts = await wpTool.listPaginatedPosts(token, 1, 5);
    expect(Array.isArray(posts)).toBe(true);
    expect(posts.length).toBeGreaterThan(0);
  });

  // ✅ Test : Delete Post
  test('Should delete a post', async () => {
    const newPost = await wpTool.createPost(token, 'Post for Deletion', 'This will be deleted', 'draft');
    const deleteResult = await wpTool.deletePost(token, newPost.id);
    expect(deleteResult).toHaveProperty('id');
  });

  // ✅ Test : Override Credentials
  test('Should allow credential override in _call method', async () => {
    // This test just verifies the method doesn't throw when credentials are provided
    // We can't actually test different credentials without having multiple WP instances
    const input = {
      'action': 'listCategories',
      'wordpress_url': process.env.WORDPRESS_BASE_URL,
      'wordpress_username': process.env.WORDPRESS_USERNAME,
      'wordpress_password': process.env.WORDPRESS_PASSWORD,
    };

    const result = await wpTool._call(input);
    const categories = JSON.parse(result);
    expect(Array.isArray(categories)).toBe(true);
  });
});